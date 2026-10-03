import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Logger } from "pino";
import { logger as defaultLogger } from "../logging/logger";

// Application-level envelope encryption for free-text clinical fields
// (backend-architecture.md section 7). Stored value format:
//
//   v1:{keyId}:{iv}:{tag}:{ciphertext}      (iv, tag, ciphertext in base64url)
//
// - AES-256-GCM, fresh 12-byte IV for every value.
// - The key ID says which data key encrypted the value, so old values keep
//   decrypting after a new key becomes current (rotation).
// - Data keys come from a KeyProvider: wrapped by KMS in AWS, derived from a
//   local development secret on a developer machine.
// - An optional `context` (for example "clinical_notes.note_enc:<row id>") is
//   bound into the tag, so a ciphertext copied to another row or column fails.
// - A value that cannot be decrypted returns null and logs an error that holds
//   only the key ID. It never throws into the request and never logs data.

const VERSION = "v1";
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface KeyProvider {
  /** The key new values are encrypted with. */
  currentKeyId(): string;
  /** The 32-byte data key for a key ID. Throws if the ID is unknown. */
  getKey(keyId: string): Promise<Buffer>;
}

/** Development provider: data keys are derived from one local secret, one per key ID. */
export class LocalKeyProvider implements KeyProvider {
  private readonly master: Buffer;

  constructor(
    masterSecret: string,
    private readonly current = "local-1",
  ) {
    if (masterSecret.length < 32) throw new Error("LOCAL_DEV_KEY must be at least 32 characters");
    if (!KEY_ID.test(current)) throw new Error("invalid key id");
    this.master = Buffer.from(masterSecret, "utf8");
  }

  currentKeyId(): string {
    return this.current;
  }

  async getKey(keyId: string): Promise<Buffer> {
    if (!KEY_ID.test(keyId)) throw new Error("invalid key id");
    return Buffer.from(
      hkdfSync("sha256", this.master, Buffer.from(keyId), "vinicure-data-key", 32),
    );
  }
}

/** The part of the AWS KMS client the provider needs. The real client is wired in P3. */
export interface KmsClient {
  decrypt(wrapped: Buffer): Promise<Buffer>;
}

/**
 * Production provider. Each key ID maps to a data key that KMS wrapped. Keys are
 * unwrapped once and held in memory only, never written anywhere.
 */
export class KmsKeyProvider implements KeyProvider {
  private readonly cache = new Map<string, Buffer>();

  constructor(
    private readonly client: KmsClient,
    private readonly wrappedKeys: ReadonlyMap<string, Buffer>,
    private readonly current: string,
  ) {
    if (!wrappedKeys.has(current)) throw new Error("current key id has no wrapped key");
  }

  currentKeyId(): string {
    return this.current;
  }

  async getKey(keyId: string): Promise<Buffer> {
    const cached = this.cache.get(keyId);
    if (cached) return cached;
    const wrapped = this.wrappedKeys.get(keyId);
    if (!wrapped) throw new Error("unknown key id");
    const key = await this.client.decrypt(wrapped);
    if (key.length !== 32) throw new Error("data key must be 32 bytes");
    this.cache.set(keyId, key);
    return key;
  }
}

type Parsed = { keyId: string; iv: Buffer; tag: Buffer; data: Buffer };

function parse(value: string): Parsed | null {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  const [, keyId, iv, tag, data] = parts as [string, string, string, string, string];
  if (!KEY_ID.test(keyId)) return null;
  const ivBuf = Buffer.from(iv, "base64url");
  const tagBuf = Buffer.from(tag, "base64url");
  if (ivBuf.length !== IV_BYTES || tagBuf.length !== TAG_BYTES) return null;
  return { keyId, iv: ivBuf, tag: tagBuf, data: Buffer.from(data, "base64url") };
}

export class Crypto {
  constructor(
    private readonly keys: KeyProvider,
    private readonly logger: Logger = defaultLogger,
  ) {}

  /** Encrypts text. null and undefined pass through; an empty string is encrypted like any other value. */
  async encrypt(plaintext: string, context?: string): Promise<string>;
  async encrypt(plaintext: null | undefined, context?: string): Promise<null>;
  async encrypt(plaintext: string | null | undefined, context?: string): Promise<string | null>;
  async encrypt(plaintext: string | null | undefined, context?: string): Promise<string | null> {
    if (plaintext === null || plaintext === undefined) return null;
    const keyId = this.keys.currentKeyId();
    const key = await this.keys.getKey(keyId);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    if (context !== undefined) cipher.setAAD(Buffer.from(context, "utf8"));
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      keyId,
      iv.toString("base64url"),
      tag.toString("base64url"),
      data.toString("base64url"),
    ].join(":");
  }

  /**
   * Decrypts a stored value. Returns null for null input, for a value that is not
   * in the v1 format (plaintext is never accepted), for a wrong key or context, and
   * for any tampering. A failure is logged with the key ID only.
   */
  async decrypt(value: string | null | undefined, context?: string): Promise<string | null> {
    if (value === null || value === undefined) return null;
    const parsed = parse(value);
    if (!parsed) {
      this.logger.error({ event: "decrypt_failed", reason: "bad_format" });
      return null;
    }
    try {
      const key = await this.keys.getKey(parsed.keyId);
      const decipher = createDecipheriv("aes-256-gcm", key, parsed.iv);
      if (context !== undefined) decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(parsed.tag);
      return Buffer.concat([decipher.update(parsed.data), decipher.final()]).toString("utf8");
    } catch {
      this.logger.error({ event: "decrypt_failed", reason: "auth_or_key", keyId: parsed.keyId });
      return null;
    }
  }

  /** True when the value was written with a key other than the current one. */
  needsRotation(value: string): boolean {
    const parsed = parse(value);
    return parsed !== null && parsed.keyId !== this.keys.currentKeyId();
  }

  /**
   * For the rotation job: returns the value re-encrypted with the current key, or
   * null when it is already current or cannot be decrypted (left untouched, logged).
   */
  async rotate(value: string, context?: string): Promise<string | null> {
    if (!this.needsRotation(value)) return null;
    const plaintext = await this.decrypt(value, context);
    if (plaintext === null) return null;
    return this.encrypt(plaintext, context);
  }
}

let shared: Crypto | undefined;

/** Wires the process-wide crypto from configuration (see config.ts). */
export function configureCrypto(crypto: Crypto): void {
  shared = crypto;
}

export function getCrypto(): Crypto {
  if (!shared) throw new Error("crypto is not configured");
  return shared;
}
