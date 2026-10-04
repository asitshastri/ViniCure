import { betterAuth, getCurrentAdapter, type BetterAuthOptions } from "better-auth";
import type { Role } from "../../lib/api/types";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { uuidv7 } from "../../lib/ids";
import { identityModels } from "./schema";
import { PATIENT_SESSION_SECONDS, FRESH_LOGIN_SECONDS, sessionExpiry } from "./session-policy";
import { PASSWORD_PROBLEM_TEXT, passwordProblem } from "./password";
import { isStaff } from "./session-policy";
import { sessionRefusal, type AccountState } from "./staff";
import { UPDATE_USER_FIELDS, hashIdentifier, isAllowedAuthPath, stripTokens } from "./surface";

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
  /**
   * The roles of a user, read whenever a session is about to be created. Roles are written
   * before any session exists (invitation, first phone sign-in), so a separate connection sees them.
   */
  rolesOf: (userId: string) => Promise<readonly Role[]>;
  /** How many proxies sit in front of the app, for reading the client address. */
  trustedProxyHops?: number;
  /** Better Auth paths opened by a method added later (P2-16, P2-17), on top of surface.ts. */
  extraAllowedPaths?: ReadonlySet<string>;
  /** Sends the staff password reset email. Without it the reset endpoints do nothing. */
  sendPasswordReset?: (input: { to: string; token: string }) => Promise<void>;
  /** Reports a failed side effect (an email that could not be sent) without personal data. */
  onSideEffectFailure?: (what: string) => void;
  /** Extra Better Auth plugins and sign-in methods, added by later tasks (P2-03, P2-05, P2-17). */
  plugins?: BetterAuthOptions["plugins"];
  emailAndPassword?: BetterAuthOptions["emailAndPassword"];
  socialProviders?: BetterAuthOptions["socialProviders"];
};

export const SESSION_COOKIE = {
  production: "__Host-vc_session",
  development: "vc_session",
} as const;

export const PASSWORD_RESET_SECONDS = 30 * 60;

/**
 * Applies the password policy to a new password (reset or change) and, for a reset, refuses a
 * token that does not belong to a staff account. The token is only looked at here, not used up.
 */
async function enforcePasswordPolicy(
  ctx: {
    path?: string;
    body?: unknown;
    context: {
      internalAdapter: {
        findVerificationValue: (id: string) => Promise<{ value: string } | null>;
        findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
      };
    };
  },
  deps: { rolesOf: (userId: string) => Promise<readonly Role[]> },
  sessionEmail?: string,
): Promise<void> {
  const body = (ctx.body ?? {}) as { newPassword?: unknown; token?: unknown };
  if (typeof body.newPassword !== "string") return; // Better Auth rejects the shape itself
  let email = sessionEmail;
  if (ctx.path === "/reset-password") {
    const token = typeof body.token === "string" ? body.token : "";
    const found = token
      ? await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`)
      : null;
    const user = found ? await ctx.context.internalAdapter.findUserById(found.value) : null;
    // Unknown, used or expired token: let Better Auth give its own (generic) answer.
    if (!user) return;
    if (!isStaff(await deps.rolesOf(user.id))) {
      throw new APIError("BAD_REQUEST", { message: "Invalid token", code: "INVALID_TOKEN" });
    }
    email = user.email;
  }
  const problem = passwordProblem(body.newPassword, email ?? "");
  if (problem) {
    throw new APIError("BAD_REQUEST", {
      message: PASSWORD_PROBLEM_TEXT[problem],
      code: "PASSWORD_TOO_WEAK",
    });
  }
}

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

    emailAndPassword: {
      ...(deps.emailAndPassword ?? { enabled: false }),
      ...(deps.sendPasswordReset
        ? {
            // The link is valid for 30 minutes and works once (Better Auth consumes the token).
            resetPasswordTokenExpiresIn: PASSWORD_RESET_SECONDS,
            sendResetPassword: async ({
              user,
              token,
            }: {
              user: { id: string; email: string };
              token: string;
            }) => {
              // Only staff get a link. A patient has no password and must not be given one.
              if (!isStaff(await deps.rolesOf(user.id))) return;
              // Not awaited: sending takes longer than not sending, and the answer must not
              // reveal whether an address has an account. Failures are reported, not shown.
              void deps
                .sendPasswordReset?.({ to: user.email, token })
                .catch(() => deps.onSideEffectFailure?.("password_reset_email"));
            },
          }
        : {}),
    },
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

    // Identifiers in auth_verifications (phone numbers, challenge ids) are stored as a keyed hash.
    verification: {
      ...identityModels.verification,
      storeIdentifier: { hash: hashIdentifier(deps.secret) },
    },

    hooks: {
      // Better Auth checks Origin only on requests that carry cookies. Every state-changing
      // request must come from our own origin, cookie or not: otherwise any website could make
      // a visitor's browser ask us to send SMS codes. A request with no Origin header (not a
      // browser) is left to the rate limits and captcha.
      before: createAuthMiddleware(async (ctx) => {
        // Default deny: only the paths in surface.ts exist.
        if (!isAllowedAuthPath(ctx.path ?? "", deps.extraAllowedPaths)) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }
        const origin = ctx.request?.headers.get("origin");
        if (ctx.request?.method === "GET") return;
        // A browser that says the request is cross-site but sends no Origin is refused too.
        const crossSite = ctx.request?.headers.get("sec-fetch-site") === "cross-site";
        if (origin ? !ctx.context.trustedOrigins.includes(origin) : crossSite) {
          throw new APIError("FORBIDDEN", { message: "Invalid origin" });
        }
        // New passwords must meet the staff policy, however they are set.
        if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
          const session = ctx.path === "/change-password" ? await getSessionFromCtx(ctx) : null;
          await enforcePasswordPolicy(ctx, deps, session?.user.email);
        }
        // A person may change their display name and nothing else about the record.
        if (ctx.path === "/update-user") {
          const keys = Object.keys((ctx.body ?? {}) as Record<string, unknown>);
          if (keys.length === 0 || keys.some((key) => !UPDATE_USER_FIELDS.has(key))) {
            throw new APIError("BAD_REQUEST", { message: "Only the name can be changed." });
          }
        }
      }),
      // Session tokens stay in the HttpOnly cookie; they are removed from every JSON answer.
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (!returned || typeof returned !== "object") return;
        if (returned instanceof Response || returned instanceof Error) return;
        const clean = stripTokens(returned);
        if (clean !== returned) return ctx.json(clean);
      }),
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            // The user row is read through Better Auth's own adapter: during sign-up the user is
            // created and the session made in one transaction, which a second connection cannot
            // see yet. No context means we cannot check, so we refuse.
            const adapter = ctx ? await getCurrentAdapter(ctx.context.adapter) : null;
            const user = adapter
              ? await adapter.findOne<{ twoFactorEnabled?: boolean; status?: string }>({
                  model: "user",
                  where: [{ field: "id", value: session.userId }],
                })
              : null;
            const state: AccountState | null = user
              ? {
                  roles: await deps.rolesOf(session.userId),
                  twoFactorEnabled: user.twoFactorEnabled === true,
                  status: (user.status ?? "active") as AccountState["status"],
                }
              : null;
            // No session for a missing, locked or deleted account, and none for a staff account
            // that has not enrolled its authenticator (see staff.ts). This holds for every
            // sign-in method, so a new method cannot forget the rule.
            if (!state || sessionRefusal(state)) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-in is not available for this account.",
              });
            }
            const roles = state.roles;
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
