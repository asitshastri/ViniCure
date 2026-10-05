import {
  DecryptCommand,
  GenerateDataKeyWithoutPlaintextCommand,
  KMSClient,
} from "@aws-sdk/client-kms";
import { KmsKeyProvider, type KmsClient } from "./crypto";

// AWS KMS for the application's data keys (backend-architecture.md section 7, ADR-007).
//
// How it works: a data key (32 random bytes) is made once by KMS and stored ONLY in its wrapped
// form (KMS_WRAPPED_KEYS in the settings). The wrapped form is useless without permission to call
// KMS Decrypt on our key, which only the server's role has. At start-up the app asks KMS to unwrap
// the keys it needs, holds them in memory, and encrypts fields with them (crypto.ts). Rotation is a
// new data key with a new id; old ids keep decrypting.
//
// The wrapped key is bound to its id by the KMS encryption context, so a wrapped key copied under
// another id cannot be unwrapped. No static AWS keys are used: the credentials come from the
// server's role (the default provider chain).

const CONTEXT_APP = "vinicure";
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** The part of the AWS SDK client used here, so tests need no network. */
type Send = (command: unknown) => Promise<{ Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array }>;

const contextFor = (keyId: string) => ({ app: CONTEXT_APP, purpose: "data-key", keyId });

export class AwsKmsClient implements KmsClient {
  private readonly send: Send;

  constructor(options: { region: string; send?: Send }) {
    const client = options.send
      ? undefined
      : new KMSClient({
          region: options.region,
          // Unwrapping is safe to repeat, so the SDK may retry; it must not hang a start-up.
          requestHandler: { requestTimeout: 5000, connectionTimeout: 2000 },
          maxAttempts: 3,
        });
    this.send =
      options.send ?? ((command) => (client as KMSClient).send(command as never) as never);
  }

  async decrypt(wrapped: Buffer, keyId: string): Promise<Buffer> {
    const out = await this.send(
      new DecryptCommand({ CiphertextBlob: wrapped, EncryptionContext: contextFor(keyId) }),
    );
    if (!out.Plaintext) throw new Error("KMS returned no key");
    return Buffer.from(out.Plaintext);
  }

  /**
   * Makes a new data key and returns only its wrapped form (the plaintext is never returned to
   * us). Used once per key by `pnpm kms:new-key`.
   */
  async newWrappedKey(kmsKeyId: string, keyId: string): Promise<Buffer> {
    if (!KEY_ID.test(keyId)) throw new Error("invalid key id");
    const out = await this.send(
      new GenerateDataKeyWithoutPlaintextCommand({
        KeyId: kmsKeyId,
        KeySpec: "AES_256",
        EncryptionContext: contextFor(keyId),
      }),
    );
    if (!out.CiphertextBlob) throw new Error("KMS returned no wrapped key");
    return Buffer.from(out.CiphertextBlob);
  }
}

/** "k1=BASE64,k2=BASE64" into a map. Refuses a bad id, a repeated id and anything that is not base64. */
export function parseWrappedKeys(text: string): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const part of text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const at = part.indexOf("=");
    const id = at < 0 ? "" : part.slice(0, at);
    const value = at < 0 ? "" : part.slice(at + 1);
    if (!KEY_ID.test(id)) throw new Error("KMS_WRAPPED_KEYS: a key id is not valid");
    if (keys.has(id)) throw new Error("KMS_WRAPPED_KEYS: a key id is repeated");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length < 40) {
      throw new Error("KMS_WRAPPED_KEYS: a wrapped key is not valid base64");
    }
    keys.set(id, Buffer.from(value, "base64"));
  }
  if (keys.size === 0) throw new Error("KMS_WRAPPED_KEYS has no keys");
  return keys;
}

/** The production key provider from settings. Unwrapping happens on first use of each key. */
export function createKmsKeyProvider(options: {
  region: string;
  wrappedKeys: string;
  currentKeyId: string;
  client?: KmsClient;
}): KmsKeyProvider {
  return new KmsKeyProvider(
    options.client ?? new AwsKmsClient({ region: options.region }),
    parseWrappedKeys(options.wrappedKeys),
    options.currentKeyId,
  );
}
