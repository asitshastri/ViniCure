import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { Role } from "../../lib/api/types";
import { twoFactorSchema } from "./schema";
import { isStaff } from "./session-policy";

// Staff sign-in (P2-05): email, password and a mandatory authenticator code (TOTP), with backup
// codes. Doctors, admins and support staff are created by invitation (P2-06); nobody signs up.
//
// The rules, each proven by a test in staff.test.ts:
//   1. A staff account never gets a session without a verified TOTP. The password step alone
//      returns "second step needed" and no session; the code (or a backup code) completes it.
//   2. A staff account that has not enrolled TOTP cannot get any session at all. Enrolment
//      happens during the invitation (P2-06), before the first sign-in.
//   3. A staff account can never sign in by phone alone (the phone plugin refuses staff).
//   4. Staff cannot switch two-factor off, and "trust this device" is refused, so the code is
//      asked at every sign-in.
//   5. A locked or deleted account gets no session by any method.

export type AccountState = {
  roles: readonly Role[];
  twoFactorEnabled: boolean;
  status: "active" | "locked" | "deleted";
};

export const TOTP_ISSUER = "ViniCure";

/** Why a session is refused, or null when it may be created. Pure so it is easy to test. */
export function sessionRefusal(state: AccountState): "inactive" | "two_factor_required" | null {
  if (state.status !== "active") return "inactive";
  if (isStaff(state.roles) && !state.twoFactorEnabled) return "two_factor_required";
  return null;
}

// Two-factor routes that must not exist for us. Enrolment is done by our own invitation flow
// (P2-06) and staff may never turn two-factor off; the emailed/SMS code method is not used.
const BLOCKED_PATHS = new Set([
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
]);

const TRUST_DEVICE_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

export function createStaffPlugins(): BetterAuthPlugin[] {
  const plugin = twoFactor({
    issuer: TOTP_ISSUER,
    schema: twoFactorSchema,
    totpOptions: { digits: 6, period: 30 },
    // Backup codes: 10 codes of 10 characters, used once each, stored encrypted with AUTH_SECRET.
    backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
    // The challenge cookie lives 5 minutes; Better Auth also locks the account after 10 wrong
    // codes (P2-15 tunes the lockout).
    twoFactorCookieMaxAge: 5 * 60,
    accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
  });

  const guard: BetterAuthPlugin = {
    id: "vinicure-two-factor-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => BLOCKED_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async () => {
            throw new APIError("NOT_FOUND", { message: "Not found" });
          }),
        },
        {
          matcher: (ctx) => TRUST_DEVICE_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { trustDevice?: unknown } | undefined;
            if (body?.trustDevice) {
              throw new APIError("BAD_REQUEST", { message: "This device cannot be trusted." });
            }
          }),
        },
      ],
    },
  };

  return [plugin, guard];
}

/** Email and password settings for staff. Sign-up is off: accounts come from invitations. */
export const staffEmailAndPassword: NonNullable<BetterAuthOptions["emailAndPassword"]> = {
  enabled: true,
  disableSignUp: true,
  autoSignIn: false,
  requireEmailVerification: true,
  minPasswordLength: 12,
  maxPasswordLength: 128,
};
