import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { HCaptchaVerifier } from "../../lib/adapters/hcaptcha";
import { getSmsProvider } from "../../lib/adapters/registry";
import { getCache } from "../../lib/cache";
import { logger } from "../../lib/logging/logger";
import { RateLimiter } from "../../lib/rate-limit/limiter";
import { createAuth, type Auth } from "./auth";
import { guardOtpRequest, type OtpGuardDeps } from "./otp-guard";
import { createPhonePlugin } from "./phone";
import { IdentityRepo } from "./repo";

// The public face of the identity module. The rest of the code imports from here, never from
// better-auth directly.

export { type Auth } from "./auth";
export { FRESH_LOGIN_SECONDS, isFreshLogin, isStaff } from "./session-policy";

// Used only when AUTH_SECRET is unset, which production configuration refuses.
const DEV_SECRET = "development-only-auth-secret-not-for-production-use";

const holder = globalSingleton("auth", () => ({ auth: undefined as Auth | undefined }));

/** The Better Auth instance for this process, created on first use. */
export function getAuth(): Auth {
  if (holder.auth) return holder.auth;
  const config = getConfig();
  const production = config.NODE_ENV === "production";
  const database = getDatabase();
  const repo = new IdentityRepo(queryable(database));
  holder.auth = createAuth({
    database: database.pool,
    secret: config.AUTH_SECRET ?? DEV_SECRET,
    baseUrl: config.APP_URL,
    trustedOrigins: [new URL(config.APP_URL).origin, ...config.AUTH_TRUSTED_ORIGINS],
    production,
    rolesOf: (userId) => repo.rolesOf(userId),
    trustedProxyHops: config.TRUSTED_PROXY_HOPS,
    plugins: [
      createPhonePlugin({
        // Resolved at send time so a missing real provider fails the send, not the whole auth route.
        sms: { sendTemplate: (input) => getSmsProvider().sendTemplate(input) },
        allowedCountryCodes: config.ALLOWED_PHONE_COUNTRY_CODES,
        onVerified: (userId) => repo.recordPhoneVerified(userId),
      }),
    ],
  });
  return holder.auth;
}

const guardHolder = globalSingleton("otp-guard", () => ({
  deps: undefined as OtpGuardDeps | undefined,
}));

function getOtpGuardDeps(): OtpGuardDeps {
  if (guardHolder.deps) return guardHolder.deps;
  const config = getConfig();
  const cache = getCache();
  guardHolder.deps = {
    limiter: new RateLimiter({
      cache,
      env: config.APP_ENV,
      hashSecret: config.AUTH_SECRET ?? DEV_SECRET,
    }),
    captcha: config.HCAPTCHA_SECRET
      ? new HCaptchaVerifier({ secret: config.HCAPTCHA_SECRET, siteKey: config.HCAPTCHA_SITE_KEY })
      : undefined,
    cache,
    env: config.APP_ENV,
    dailySmsCap: config.SMS_DAILY_CAP,
    allowedCountryCodes: config.ALLOWED_PHONE_COUNTRY_CODES,
    production: config.NODE_ENV === "production",
    trustedProxyHops: config.TRUSTED_PROXY_HOPS,
    alert: (event, data) => logger.warn({ event: `otp_${event}`, security: true, ...data }),
  };
  return guardHolder.deps;
}

/**
 * Abuse controls for the OTP routes (limits, captcha, daily SMS budget). Call before handing a
 * request to Better Auth. Throws an AppError when the request must stop.
 */
export function guardAuthRequest(request: Request): Promise<void> {
  return guardOtpRequest(request, getOtpGuardDeps());
}

export function resetAuthForTest(): void {
  holder.auth = undefined;
  guardHolder.deps = undefined;
}
