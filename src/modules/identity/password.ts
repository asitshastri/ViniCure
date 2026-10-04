import { hashPassword, verifyPassword } from "better-auth/crypto";

// Password hashing in one place. Better Auth signs staff in with `hash` and `verify`, and the
// invitation flow stores new passwords with `hash`, so both always agree. Today this is Better
// Auth's default (scrypt, N=16384, r=16, p=1, 64 byte key). P2-15 decides on Argon2id and
// changes only this file.

export const passwordHasher = {
  hash: (password: string): Promise<string> => hashPassword(password),
  verify: (input: { hash: string; password: string }): Promise<boolean> => verifyPassword(input),
};

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// The most used passwords that still reach 12 characters. Not a full list: it stops the obvious
// ones (P2-15 adds the breach-list check).
const COMMON = new Set([
  "password1234",
  "123456789012",
  "qwertyuiop12",
  "1234567890ab",
  "password12345",
  "iloveyou1234",
  "administrator",
  "welcome12345",
  "letmein12345",
  "changeme1234",
  "vinicure1234",
  "vinicure12345",
]);

export type PasswordProblem = "too_short" | "too_long" | "common" | "repetitive" | "contains_email";

/** Staff password rules. Returns the first problem, or null when the password is acceptable. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "common";
  if (new Set(lower).size < 5) return "repetitive";
  const local = email.toLowerCase().split("@")[0] ?? "";
  if (local.length >= 4 && lower.includes(local)) return "contains_email";
  return null;
}

export const PASSWORD_PROBLEM_TEXT: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  common: "That password is too common. Choose another.",
  repetitive: "That password repeats too few characters. Choose another.",
  contains_email: "The password must not contain your email name.",
};
