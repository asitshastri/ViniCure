import { configureApi } from "./api/deps";
import { AuditService, MemoryAuditStore } from "./audit/audit";
import { PgAuditStore } from "./audit/repo";
import { configureCache, createCache } from "./cache";
import { getConfig } from "./config/config";
import { configureCrypto } from "./crypto/crypto";
import { cryptoFromConfig } from "./crypto/from-config";
import { configureDatabase, queryable } from "./db/pool";
import { MemoryDurableStore, createIdempotency } from "./idempotency/idempotency";
import { PgDurableStore } from "./idempotency/repo";
import { installSignalHandlers } from "./lifecycle";
import { logger } from "./logging/logger";
import { authenticateRequest } from "../modules/identity";
import { RateLimiter } from "./rate-limit/limiter";

// Wires the shared modules once, when the server starts (src/instrumentation.ts).
// Later tasks add their pieces here: database (P1-01), queue (P1-11), audit
// (P1-17), idempotency (P1-16), session lookup (P2).

// Used only when AUTH_SECRET is unset, which production config refuses.
const DEV_HASH_SECRET = "development-only-hash-secret-not-for-production";

export function bootstrap(): void {
  const config = getConfig();

  const cache = createCache(config);
  configureCache(cache);

  const limiter = new RateLimiter({
    cache,
    env: config.APP_ENV,
    hashSecret: config.AUTH_SECRET ?? DEV_HASH_SECRET,
  });
  configureApi({
    rateLimit: limiter.check,
    trustedProxyHops: config.TRUSTED_PROXY_HOPS,
    // Session lookup (P2): reads the session cookie and the roles of the signed-in person.
    authenticate: authenticateRequest,
    trustedOrigins: [new URL(config.APP_URL).origin, ...config.AUTH_TRUSTED_ORIGINS],
  });

  const crypto = cryptoFromConfig(config);
  if (crypto) {
    configureCrypto(crypto);
  } else if (config.CRYPTO_PROVIDER === "kms") {
    // Production configuration refuses this, so it is reached only in development.
    logger.warn({ event: "crypto_not_configured", provider: "kms" });
  }

  // With a database, audit and idempotency records go to Postgres. Without one, development
  // uses in-memory stores. In production they stay unset until the database is configured, so
  // audited and idempotent routes refuse to run instead of running unrecorded.
  const database = configureDatabase(config);
  if (database) {
    const db = queryable(database);
    configureApi({ audit: new AuditService(new PgAuditStore(db)).writer });
    if (crypto) {
      configureApi({
        idempotency: createIdempotency({
          cache,
          store: new PgDurableStore(db),
          crypto,
          env: config.APP_ENV,
        }),
      });
    }
  } else if (config.NODE_ENV !== "production") {
    configureApi({ audit: new AuditService(new MemoryAuditStore()).writer });
    if (crypto) {
      configureApi({
        idempotency: createIdempotency({
          cache,
          store: new MemoryDurableStore(),
          crypto,
          env: config.APP_ENV,
        }),
      });
    }
  }

  // Close pools when the process is told to stop. Next.js decides when to exit.
  installSignalHandlers({ exit: false });
}
