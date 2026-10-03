import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth";
import type { SmsProvider } from "../../lib/adapters/types";
import { AdapterError, E164 } from "../../lib/adapters/types";
import { uuidv7 } from "../../lib/ids";
import { phoneNumberSchema } from "./schema";

// Patient phone OTP sign-in (P2-03, decision D-019): the phone is a way to sign in, not the
// identity. The OTP is sent through the SmsProvider adapter (fake in development and tests).
//
// Where the OTP lives: Better Auth stores "<code>:<attempts>" in auth_verifications.value,
// keyed by the phone number, for 5 minutes and 3 wrong attempts. The code is therefore in the
// database in clear text for that short time. See ADR-004 (Not verified: hash it in P2-13).
// The OTP is never logged: nothing in this file logs a phone number or a code.

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_SMS_TEMPLATE = "otp";

/** Placeholder address for patients without an email (D-020). The application treats it as none. */
export const NO_EMAIL_DOMAIN = "no-email.invalid";

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}

// An Indian mobile number: +91 then ten digits starting 6 to 9.
const INDIA_MOBILE = /^\+91[6-9]\d{9}$/;

/**
 * Turns what a person typed into canonical E.164, or null when it cannot be a number we accept.
 * Accepts "98765 43210", "09876543210", "+91 98765-43210", "919876543210". Only country codes in
 * the allow-list pass; +91 numbers must be valid Indian mobile numbers.
 */
export function normalizePhone(
  raw: string,
  allowedCountryCodes: readonly string[] = ["+91"],
): string | null {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const compact = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let candidate: string;
  if (compact.startsWith("+")) candidate = compact;
  else if (/^0\d{10}$/.test(compact)) candidate = `+91${compact.slice(1)}`;
  else if (/^\d{10}$/.test(compact)) candidate = `+91${compact}`;
  else if (/^91\d{10}$/.test(compact)) candidate = `+${compact}`;
  else return null;

  return isAllowedPhone(candidate, allowedCountryCodes) ? candidate : null;
}

/** True for a canonical E.164 number in an allowed country (and a valid mobile number for +91). */
export function isAllowedPhone(value: string, allowedCountryCodes: readonly string[]): boolean {
  if (!E164.test(value)) return false;
  if (!allowedCountryCodes.some((code) => value.startsWith(code))) return false;
  if (value.startsWith("+91")) return INDIA_MOBILE.test(value);
  return true;
}

// Paths from the phone-number plugin that must not exist: patients have no password, so the
// password sign-in and the phone password reset would only be extra doors.
const BLOCKED_PATHS = new Set([
  "/sign-in/phone-number",
  "/phone-number/request-password-reset",
  "/phone-number/reset-password",
]);

export type PhoneDeps = {
  sms: SmsProvider;
  allowedCountryCodes: readonly string[];
  /** True when the user holds a staff role. Staff never sign in by phone alone (P2-05). */
  isStaff: (userId: string) => Promise<boolean>;
  /** Called after a code is proven: record the time and give a new patient the patient role. */
  onVerified: (userId: string) => Promise<void>;
  /** Reports an SMS failure without the phone number or code. */
  onSmsFailure?: (kind: string) => void;
};

export function createPhonePlugin(deps: PhoneDeps): BetterAuthPlugin {
  const plugin = phoneNumber({
    otpLength: OTP_LENGTH,
    expiresIn: OTP_TTL_SECONDS,
    allowedAttempts: OTP_MAX_ATTEMPTS,
    schema: phoneNumberSchema,
    phoneNumberValidator: (value) => isAllowedPhone(value, deps.allowedCountryCodes),
    signUpOnVerification: {
      getTempEmail: () => `${uuidv7()}@${NO_EMAIL_DOMAIN}`,
      getTempName: () => "Patient",
    },
    sendOTP: async ({ phoneNumber: to, code }) => {
      try {
        await deps.sms.sendTemplate({ to, templateKey: OTP_SMS_TEMPLATE, variables: { code } });
      } catch (error) {
        const kind = error instanceof AdapterError ? error.kind : "unknown";
        deps.onSmsFailure?.(kind);
        // A generic message: the provider error may contain the number.
        throw new APIError("SERVICE_UNAVAILABLE", {
          message: "Could not send the code. Try again.",
        });
      }
    },
    callbackOnVerification: async ({ user }) => {
      // Runs before the session is created. A staff member proves a phone with a code only to
      // change a number, never to sign in: refuse, and no session is made.
      if (await deps.isStaff(user.id)) {
        throw new APIError("FORBIDDEN", { message: "Sign-in is not available for this account." });
      }
      await deps.onVerified(user.id);
    },
  });

  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      before: [
        ...(plugin.hooks?.before ?? []),
        {
          matcher: (ctx) => BLOCKED_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async () => {
            throw new APIError("NOT_FOUND", { message: "Not found" });
          }),
        },
      ],
    },
  };
}
