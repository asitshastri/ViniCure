import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { getSmsProvider } from "../../lib/adapters/registry";
import { createAuth, type Auth } from "./auth";
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

export function resetAuthForTest(): void {
  holder.auth = undefined;
}
