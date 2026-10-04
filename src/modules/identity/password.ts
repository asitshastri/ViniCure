import { randomBytes } from "node:crypto";
import { argon2Verify, argon2id } from "hash-wasm";

// Password hashing in one place (P2-15). Better Auth signs staff in with `hash` and `verify`, and
// the invitation flow stores new passwords with `hash`, so both always agree.
//
// Algorithm: Argon2id, the first choice of the OWASP Password Storage Cheat Sheet, with its
// minimum recommended cost: 19 MiB of memory, 2 passes, 1 lane (about 100 ms on a small server).
// The salt is 16 random bytes, the result 32 bytes, stored as the standard PHC string
// ("$argon2id$v=19$m=19456,t=2,p=1$salt$hash") so the cost can be raised later and old hashes
// still verify. Implementation: hash-wasm (WebAssembly, no native build, no dependencies).
//
// Better Auth's own default is scrypt. It is not accepted here: a stored hash that is not
// Argon2id never verifies, so nothing can be downgraded to a weaker algorithm.

export const ARGON2 = { memoryKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32 } as const;

export const passwordHasher = {
  hash: (password: string): Promise<string> =>
    argon2id({
      password,
      salt: randomBytes(16),
      parallelism: ARGON2.parallelism,
      iterations: ARGON2.iterations,
      memorySize: ARGON2.memoryKiB,
      hashLength: ARGON2.hashLength,
      outputType: "encoded",
    }),
  verify: async (input: { hash: string; password: string }): Promise<boolean> => {
    if (!input.hash.startsWith("$argon2id$")) return false;
    try {
      return await argon2Verify({ password: input.password, hash: input.hash });
    } catch {
      return false; // a malformed stored value is a failed sign-in, never an error page
    }
  },
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
