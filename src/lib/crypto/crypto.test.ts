import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { buildLoggerOptions } from "../logging/logger";
import { Crypto, KmsKeyProvider, LocalKeyProvider, type KmsClient } from "./crypto";

const SECRET = "a-local-development-secret-of-32+chars";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { log: pino(buildLoggerOptions("info"), stream), lines };
}

const make = (secret = SECRET, keyId = "k1") => {
  const sink = capture();
  return { crypto: new Crypto(new LocalKeyProvider(secret, keyId), sink.log), ...sink };
};

describe("round trip", () => {
  it("encrypts and decrypts, including unicode and empty text", async () => {
    const { crypto } = make();
    for (const text of ["fever for three days", "बुखार तीन दिन से", "", "x".repeat(10_000)]) {
      const stored = await crypto.encrypt(text);
      expect(stored.startsWith("v1:k1:")).toBe(true);
      expect(stored).not.toContain(text.slice(0, 8) || "\u0000");
      expect(await crypto.decrypt(stored)).toBe(text);
    }
  });

  it("uses a fresh IV, so the same text gives different ciphertext", async () => {
    const { crypto } = make();
    expect(await crypto.encrypt("same")).not.toBe(await crypto.encrypt("same"));
  });

  it("passes null and undefined through", async () => {
    const { crypto } = make();
    expect(await crypto.encrypt(null)).toBeNull();
    expect(await crypto.encrypt(undefined)).toBeNull();
    expect(await crypto.decrypt(null)).toBeNull();
  });
});

describe("tampering", () => {
  it("returns null for any changed part and logs without data", async () => {
    const { crypto, lines } = make();
    const stored = await crypto.encrypt("secret note");
    const [v, k, iv, tag, data] = stored.split(":") as [string, string, string, string, string];
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    for (const bad of [
      [v, k, flip(iv), tag, data],
      [v, k, iv, flip(tag), data],
      [v, k, iv, tag, flip(data)],
    ]) {
      expect(await crypto.decrypt(bad.join(":"))).toBeNull();
    }
    expect(lines.length).toBe(3);
    expect(lines.join("")).not.toContain("secret note");
    expect(lines.join("")).toContain("decrypt_failed");
  });

  it("rejects plaintext, other versions and malformed values instead of returning them", async () => {
    const { crypto } = make();
    for (const value of [
      "just plain text",
      "",
      "v2:k1:a:b:c",
      "v1:k1:a:b",
      "v1:K!:a:b:c",
      "a:b:c",
    ]) {
      expect(await crypto.decrypt(value)).toBeNull();
    }
  });
});

describe("keys", () => {
  it("a different secret cannot decrypt", async () => {
    const stored = await make().crypto.encrypt("note");
    const other = make("another-development-secret-with-32-chars!!");
    expect(await other.crypto.decrypt(stored)).toBeNull();
    expect(other.lines.join("")).toContain("k1");
  });

  it("an unknown key id returns null", async () => {
    const client: KmsClient = { decrypt: async () => randomBytes(32) };
    const kms = new Crypto(
      new KmsKeyProvider(client, new Map([["k9", Buffer.from("w")]]), "k9"),
      capture().log,
    );
    const local = await make().crypto.encrypt("note"); // key id k1, not known to kms
    expect(await kms.decrypt(local)).toBeNull();
  });

  it("context binds a value to its row and column", async () => {
    const { crypto } = make();
    const stored = await crypto.encrypt("note", "clinical_notes.note_enc:row-1");
    expect(await crypto.decrypt(stored, "clinical_notes.note_enc:row-1")).toBe("note");
    expect(await crypto.decrypt(stored, "clinical_notes.note_enc:row-2")).toBeNull();
    expect(await crypto.decrypt(stored)).toBeNull();
  });

  it("rejects a short local secret", () => {
    expect(() => new LocalKeyProvider("short")).toThrow();
  });
});

describe("rotation", () => {
  it("old values still decrypt after the current key changes, and rotate moves them to the new key", async () => {
    const old = make(SECRET, "k1").crypto;
    const stored = await old.encrypt("note", "ctx");

    const next = make(SECRET, "k2").crypto;
    expect(next.needsRotation(stored)).toBe(true);
    expect(await next.decrypt(stored, "ctx")).toBe("note");

    const rotated = await next.rotate(stored, "ctx");
    expect(rotated).not.toBeNull();
    expect(rotated?.startsWith("v1:k2:")).toBe(true);
    expect(await next.decrypt(rotated, "ctx")).toBe("note");
    expect(next.needsRotation(rotated as string)).toBe(false);
    expect(await next.rotate(rotated as string, "ctx")).toBeNull();
  });

  it("leaves a value it cannot decrypt alone", async () => {
    const next = make(SECRET, "k2");
    const stored = await make("another-development-secret-with-32-chars!!", "k1").crypto.encrypt(
      "note",
    );
    expect(await next.crypto.rotate(stored)).toBeNull();
  });
});

describe("KMS provider", () => {
  it("unwraps each key once and keeps it in memory", async () => {
    let unwraps = 0;
    const dataKey = randomBytes(32);
    const client: KmsClient = {
      decrypt: async () => {
        unwraps += 1;
        return dataKey;
      },
    };
    const provider = new KmsKeyProvider(
      client,
      new Map([["kms-1", Buffer.from("wrapped")]]),
      "kms-1",
    );
    const crypto = new Crypto(provider, capture().log);
    const stored = await crypto.encrypt("note");
    await crypto.decrypt(stored);
    await crypto.decrypt(stored);
    expect(unwraps).toBe(1);
    expect(await crypto.decrypt(stored)).toBe("note");
  });

  it("refuses a data key of the wrong size and a missing current key", async () => {
    const bad: KmsClient = { decrypt: async () => randomBytes(16) };
    const provider = new KmsKeyProvider(bad, new Map([["a", Buffer.from("w")]]), "a");
    await expect(provider.getKey("a")).rejects.toThrow();
    expect(() => new KmsKeyProvider(bad, new Map(), "a")).toThrow();
  });
});
