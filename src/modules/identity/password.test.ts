import { scryptSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ARGON2,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordHasher,
  passwordProblem,
} from "./password";

describe("Argon2id password hashing (P2-15)", () => {
  it("produces a standard PHC string with the OWASP minimum cost", async () => {
    const hash = await passwordHasher.hash("a long and sturdy passphrase");
    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(ARGON2).toMatchObject({ memoryKiB: 19_456, iterations: 2, parallelism: 1 });
  });

  it("verifies the right password and refuses a wrong one, including near misses", async () => {
    const hash = await passwordHasher.hash("a long and sturdy passphrase");
    expect(await passwordHasher.verify({ hash, password: "a long and sturdy passphrase" })).toBe(
      true,
    );
    for (const wrong of [
      "",
      "a long and sturdy passphrase ",
      "A long and sturdy passphrase",
      "a long and sturdy passphras",
      "x".repeat(300),
    ]) {
      expect(
        await passwordHasher.verify({ hash, password: wrong }),
        JSON.stringify(wrong.slice(0, 20)),
      ).toBe(false);
    }
  });

  it("uses a fresh salt every time, so equal passwords give different hashes", async () => {
    const [a, b] = await Promise.all([
      passwordHasher.hash("same password 1234"),
      passwordHasher.hash("same password 1234"),
    ]);
    expect(a).not.toBe(b);
    expect(await passwordHasher.verify({ hash: a, password: "same password 1234" })).toBe(true);
    expect(await passwordHasher.verify({ hash: b, password: "same password 1234" })).toBe(true);
  });

  it("handles unicode and long passwords", async () => {
    for (const password of [
      "पासवर्ड-बहुत-लंबा-123",
      "p".repeat(PASSWORD_MAX_LENGTH),
      "emoji 🔐 passphrase 123",
    ]) {
      const hash = await passwordHasher.hash(password);
      expect(await passwordHasher.verify({ hash, password })).toBe(true);
    }
  });

  it("refuses any hash that is not Argon2id: no downgrade to scrypt, bcrypt or plain text", async () => {
    const salt = randomBytes(16).toString("hex");
    const scrypt = `${salt}:${scryptSync("secret-password-1", salt, 64).toString("hex")}`; // the old default
    const bcryptLike = "$2b$12$abcdefghijklmnopqrstuuYyYyYyYyYyYyYyYyYyYyYyYyYyYyYy";
    for (const hash of [
      scrypt,
      bcryptLike,
      "secret-password-1",
      "",
      "$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaA",
      "$argon2id$garbage",
    ]) {
      expect(
        await passwordHasher.verify({ hash, password: "secret-password-1" }),
        hash.slice(0, 20),
      ).toBe(false);
    }
  });

  it("takes real work: well over a millisecond, so guessing offline is slow", async () => {
    const started = performance.now();
    await passwordHasher.hash("timing check password");
    expect(performance.now() - started).toBeGreaterThan(20);
  });
});

describe("staff password policy", () => {
  it("refuses short, long, common, repetitive and email-derived passwords", () => {
    const email = "dr.rao@example.com";
    expect(passwordProblem("short", email)).toBe("too_short");
    expect(passwordProblem("x".repeat(PASSWORD_MIN_LENGTH - 1), email)).toBe("too_short");
    expect(passwordProblem("a1".repeat(80), email)).toBe("too_long");
    expect(passwordProblem("password12345", email)).toBe("common");
    expect(passwordProblem("aaaaaaaaaaaaaaaa", email)).toBe("repetitive");
    expect(passwordProblem("my-dr.rao-secret-1", email)).toBe("contains_email");
    expect(passwordProblem("a long and sturdy passphrase", email)).toBeNull();
    expect(passwordProblem("Correct-Horse-Battery-9!", email)).toBeNull();
  });
});
