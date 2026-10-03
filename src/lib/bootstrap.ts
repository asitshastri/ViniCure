import { configureApi } from "./api/deps";
import { AuditService, MemoryAuditStore } from "./audit/audit";
import { configureCache, createCache } from "./cache";
import { getConfig } from "./config/config";
import { Crypto, LocalKeyProvider, configureCrypto } from "./crypto/crypto";
import { MemoryDurableStore, createIdempotency } from "./idempotency/idempotency";
import { logger } from "./logging/logger";
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
  configureApi({ rateLimit: limiter.check, trustedProxyHops: config.TRUSTED_PROXY_HOPS });

  let crypto: Crypto | undefined;
  if (config.CRYPTO_PROVIDER === "local" && config.LOCAL_DEV_KEY) {
    crypto = new Crypto(new LocalKeyProvider(config.LOCAL_DEV_KEY));
    configureCrypto(crypto);
  } else if (config.CRYPTO_PROVIDER === "kms") {
    // The KMS client and wrapped keys arrive with the AWS setup (P3-06).
    logger.warn({ event: "crypto_not_configured", provider: "kms" });
  }

  // Development and tests use in-memory stores. In production these stay unset until
  // the Postgres stores exist (P1-02 onward), so audited and idempotent routes refuse
  // to run instead of running unrecorded.
  if (config.NODE_ENV !== "production") {
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
}
