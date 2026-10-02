import {
  MAX_ATTEMPTS,
  MOCK_EXPIRED_OTP,
  MOCK_GOOD_BACKUP,
  MOCK_GOOD_OTP,
  MOCK_LIMITED_PHONE,
  MOCK_LOCKED_PASSWORD,
} from "@/mocks/auth";

// Components talk to this layer only. In P2 it calls /api/v1/auth/* and Better Auth.
// Messages are deliberately generic: they never say whether an account exists (no enumeration).

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "expired" | "rate_limited" | "locked" | "network";
      retryAfterSeconds?: number;
      attemptsLeft?: number;
    };

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));
let otpFailures = 0;
let staffFailures = 0;

export async function requestOtp(phone: string): Promise<AuthResult> {
  await delay();
  if (phone === MOCK_LIMITED_PHONE)
    return { ok: false, reason: "rate_limited", retryAfterSeconds: 600 };
  otpFailures = 0;
  return { ok: true };
}

export async function verifyOtp(code: string): Promise<AuthResult> {
  await delay();
  if (otpFailures >= MAX_ATTEMPTS) return { ok: false, reason: "locked", retryAfterSeconds: 900 };
  if (code === MOCK_GOOD_OTP) return { ok: true };
  if (code === MOCK_EXPIRED_OTP) return { ok: false, reason: "expired" };
  otpFailures += 1;
  if (otpFailures >= MAX_ATTEMPTS) return { ok: false, reason: "locked", retryAfterSeconds: 900 };
  return { ok: false, reason: "invalid", attemptsLeft: MAX_ATTEMPTS - otpFailures };
}

export async function staffSignIn(email: string, password: string): Promise<AuthResult> {
  await delay();
  void email;
  if (password === MOCK_LOCKED_PASSWORD)
    return { ok: false, reason: "locked", retryAfterSeconds: 900 };
  if (password === "Wrong-Password-1!") {
    staffFailures += 1;
    return {
      ok: false,
      reason: "invalid",
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - staffFailures),
    };
  }
  staffFailures = 0;
  return { ok: true };
}

export async function verifyTotp(code: string): Promise<AuthResult> {
  await delay();
  return code === MOCK_GOOD_OTP ? { ok: true } : { ok: false, reason: "invalid" };
}

export async function verifyBackupCode(code: string): Promise<AuthResult> {
  await delay();
  return code.toUpperCase().replace("-", "") === MOCK_GOOD_BACKUP.replace("-", "")
    ? { ok: true }
    : { ok: false, reason: "invalid" };
}

/** Always succeeds from the caller's view, so the page cannot be used to find out which emails exist. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  await delay();
  void email;
  return { ok: true };
}

export async function resetPassword(token: string, password: string): Promise<AuthResult> {
  await delay();
  void password;
  return token === "expired" ? { ok: false, reason: "expired" } : { ok: true };
}

export async function changePassword(current: string, next: string): Promise<AuthResult> {
  await delay();
  void next;
  return current === "Wrong-Password-1!" ? { ok: false, reason: "invalid" } : { ok: true };
}
