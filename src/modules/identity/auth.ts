import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Role } from "../../lib/api/types";
import { uuidv7 } from "../../lib/ids";
import { identityModels } from "./schema";
import { PATIENT_SESSION_SECONDS, FRESH_LOGIN_SECONDS, sessionExpiry } from "./session-policy";

// Better Auth set-up (decision D-003, ADR-004). Only this module imports better-auth: the rest of
// the code calls the functions exported from src/modules/identity.
//
// Cookies: HttpOnly, Secure and SameSite=Lax in every deployed environment, with the __Host-
// prefix (which also forbids a Domain attribute and requires Path=/). Sessions are rows in
// auth_sessions, so they can be revoked at once. No JWT, nothing in localStorage.

export type IdentityDeps = {
  /** A pg Pool or a Kysely instance. The app role, never the migrator. */
  database: BetterAuthOptions["database"];
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
  /** Secure cookies and the __Host- prefix are on whenever this is true. */
  production: boolean;
  /** The roles of a user, read when a session is created or renewed. */
  rolesOf: (userId: string) => Promise<readonly Role[]>;
  /** How many proxies sit in front of the app, for reading the client address. */
  trustedProxyHops?: number;
  /** Extra Better Auth plugins and sign-in methods, added by later tasks (P2-03, P2-05, P2-17). */
  plugins?: BetterAuthOptions["plugins"];
  emailAndPassword?: BetterAuthOptions["emailAndPassword"];
  socialProviders?: BetterAuthOptions["socialProviders"];
};

export const SESSION_COOKIE = {
  production: "__Host-vc_session",
  development: "vc_session",
} as const;

export function buildAuthOptions(deps: IdentityDeps): BetterAuthOptions {
  const cookieName = (suffix: string) => (deps.production ? `__Host-vc_${suffix}` : `vc_${suffix}`);

  return {
    appName: "ViniCure",
    baseURL: deps.baseUrl,
    basePath: "/api/auth",
    secret: deps.secret,
    database: deps.database,
    trustedOrigins: [...deps.trustedOrigins],
    ...identityModels,

    emailAndPassword: deps.emailAndPassword ?? { enabled: false },
    socialProviders: deps.socialProviders ?? {},
    plugins: deps.plugins ?? [],

    session: {
      ...identityModels.session,
      // Fixed lifetimes counted from sign-in: patients 14 days, staff 8 hours (cut in the hook
      // below). Renewal is off: Better Auth would renew every session by the patient lifetime,
      // which would stretch a staff session to 14 days.
      expiresIn: PATIENT_SESSION_SECONDS,
      disableSessionRefresh: true,
      // A session is "fresh" for 15 minutes after sign-in. Sensitive actions check this.
      freshAge: FRESH_LOGIN_SECONDS,
      // No session data in a cookie: every request is checked against the database, so a
      // revoked session stops working at once.
      cookieCache: { enabled: false },
    },

    advanced: {
      // Better Auth would put a __Secure- prefix in front of our __Host- names, which breaks the
      // __Host- rules. Secure is set through the attributes below instead.
      useSecureCookies: false,
      // Better Auth turns both checks off when it detects a test environment. Say so explicitly:
      // they are on everywhere, and a test proves it.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: deps.production,
        sameSite: "lax",
        path: "/",
        // No Domain attribute ever: the cookie belongs to this host only.
      },
      cookies: {
        session_token: { name: cookieName("session") },
        session_data: { name: cookieName("session_data") },
        dont_remember: { name: cookieName("dont_remember") },
      },
      // Read the client address from the right of X-Forwarded-For (the load balancer's view).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      database: { generateId: () => uuidv7() },
    },

    // Our own rate limiter (src/lib/rate-limit) guards /api/auth through withApi.
    rateLimit: { enabled: false },

    hooks: {
      // Better Auth checks Origin only on requests that carry cookies. Every state-changing
      // request must come from our own origin, cookie or not: otherwise any website could make
      // a visitor's browser ask us to send SMS codes. A request with no Origin header (not a
      // browser) is left to the rate limits and captcha.
      before: createAuthMiddleware(async (ctx) => {
        const origin = ctx.request?.headers.get("origin");
        if (!origin || ctx.request?.method === "GET") return;
        if (!ctx.context.trustedOrigins.includes(origin)) {
          throw new APIError("FORBIDDEN", { message: "Invalid origin" });
        }
      }),
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const roles = await deps.rolesOf(session.userId);
            const now = new Date();
            return {
              data: { ...session, expiresAt: sessionExpiry({ roles, createdAt: now }) },
            };
          },
        },
      },
    },
  };
}

export function createAuth(deps: IdentityDeps) {
  return betterAuth(buildAuthOptions(deps));
}

export type Auth = ReturnType<typeof createAuth>;
