import { configureApi } from "./api/deps";
import { configureCache, createCache } from "./cache";
import { getConfig } from "./config/config";
import { Crypto, LocalKeyProvider, configureCrypto } from "./crypto/crypto";
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

  if (config.CRYPTO_PROVIDER === "local" && config.LOCAL_DEV_KEY) {
    configureCrypto(new Crypto(new LocalKeyProvider(config.LOCAL_DEV_KEY)));
  } else if (config.CRYPTO_PROVIDER === "kms") {
    // The KMS client and wrapped keys arrive with the AWS setup (P3-06).
    logger.warn({ event: "crypto_not_configured", provider: "kms" });
  }
}
