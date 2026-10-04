import type { Actor } from "../../lib/api/types";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { HCaptchaVerifier } from "../../lib/adapters/hcaptcha";
import { getEmailProvider, getSmsProvider } from "../../lib/adapters/registry";
import { getCache } from "../../lib/cache";
import { logger } from "../../lib/logging/logger";
import { RateLimiter } from "../../lib/rate-limit/limiter";
import { createAuth, type Auth } from "./auth";
import { guardOtpRequest, type OtpGuardDeps } from "./otp-guard";
import { invitationCrypto } from "./invitation-crypto";
import { InvitationService } from "./invitations";
import { createPhonePlugin } from "./phone";
import { SessionService } from "./sessions";
import { isStaff } from "./session-policy";
import { createStaffPlugins, staffEmailAndPassword } from "./staff";
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
    emailAndPassword: staffEmailAndPassword,
    trustedProxyHops: config.TRUSTED_PROXY_HOPS,
    plugins: [
      ...createStaffPlugins(config.AUTH_SECRET ?? DEV_SECRET),
      createPhonePlugin({
        isStaff: async (userId) => isStaff(await repo.rolesOf(userId)),
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

function getRepo(): IdentityRepo {
  return new IdentityRepo(queryable(getDatabase()));
}

/**
 * Who is making this request? Reads the session cookie, checks it against the database (a
 * revoked session fails at once) and loads the roles. Plugged into withApi at start-up.
 */
export async function authenticateRequest(request: Request): Promise<Actor | null> {
  return actorFromHeaders(request.headers);
}

/** Same lookup for server components, which have headers but no Request. */
export async function actorFromHeaders(headers: Headers): Promise<Actor | null> {
  const found = await getAuth().api.getSession({ headers });
  if (!found) return null;
  const state = await getRepo().accountState(found.user.id);
  if (!state || state.status !== "active") return null;
  return {
    userId: found.user.id,
    roles: state.roles,
    sessionId: found.session.id,
    displayName: found.user.name,
    lastSignInAt: new Date(found.session.createdAt),
  };
}

const invitationHolder = globalSingleton("invitations", () => ({
  service: undefined as InvitationService | undefined,
}));

/** Staff invitations (P2-06): create, enrol the authenticator, accept. */
export function getInvitations(): InvitationService {
  if (invitationHolder.service) return invitationHolder.service;
  invitationHolder.service = new InvitationService({
    repo: getRepo(),
    email: getEmailProvider(),
    crypto: invitationCrypto(getAuth()),
    appUrl: getConfig().APP_URL,
  });
  return invitationHolder.service;
}

export { INVITABLE_ROLES } from "./invitations";
export { expiredSessionCookie } from "./sessions";

export function getSessions(): SessionService {
  return new SessionService(getRepo());
}

export function resetAuthForTest(): void {
  holder.auth = undefined;
  guardHolder.deps = undefined;
  invitationHolder.service = undefined;
}
