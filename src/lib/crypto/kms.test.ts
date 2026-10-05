import { DecryptCommand, GenerateDataKeyWithoutPlaintextCommand } from "@aws-sdk/client-kms";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/config";
import { Crypto, type KmsClient } from "./crypto";
import { cryptoFromConfig } from "./from-config";
import { AwsKmsClient, createKmsKeyProvider, parseWrappedKeys } from "./kms";

// The KMS wiring without a network: what is asked of KMS, the settings format, and a full
// encrypt and decrypt through a stand-in KMS that, like the real one, checks the key id.
const W1 = randomBytes(60).toString("base64");
const W2 = randomBytes(60).toString("base64");

describe("AwsKmsClient", () => {
  it("unwraps a key with the key id in the encryption context, and returns the key bytes", async () => {
    const seen: unknown[] = [];
    const key = randomBytes(32);
    const client = new AwsKmsClient({
      region: "ap-south-1",
      send: async (command) => {
        seen.push(command);
        return { Plaintext: key };
      },
    });
    const out = await client.decrypt(Buffer.from("wrapped"), "k1");
    expect(out.equals(key)).toBe(true);
    const command = seen[0] as DecryptCommand;
    expect(command).toBeInstanceOf(DecryptCommand);
    expect(command.input.EncryptionContext).toEqual({
      app: "vinicure",
      purpose: "data-key",
      keyId: "k1",
    });
  });

  it("makes a new data key as a wrapped copy only, never asking for the plaintext", async () => {
    const seen: unknown[] = [];
    const client = new AwsKmsClient({
      region: "ap-south-1",
      send: async (command) => {
        seen.push(command);
        return { CiphertextBlob: Buffer.from("wrapped-bytes") };
      },
    });
    const wrapped = await client.newWrappedKey("alias/vinicure-test", "k2");
    expect(wrapped.toString()).toBe("wrapped-bytes");
    const command = seen[0] as GenerateDataKeyWithoutPlaintextCommand;
    // The "WithoutPlaintext" form: the key never reaches this machine.
    expect(command).toBeInstanceOf(GenerateDataKeyWithoutPlaintextCommand);
    expect(command.input).toMatchObject({ KeyId: "alias/vinicure-test", KeySpec: "AES_256" });
    expect(command.input.EncryptionContext?.keyId).toBe("k2");
    await expect(client.newWrappedKey("alias/x", "BAD ID")).rejects.toThrow(/invalid key id/);
  });

  it("an empty answer from KMS is an error, not an empty key", async () => {
    const client = new AwsKmsClient({ region: "ap-south-1", send: async () => ({}) });
    await expect(client.decrypt(Buffer.from("w"), "k1")).rejects.toThrow();
    await expect(client.newWrappedKey("alias/x", "k1")).rejects.toThrow();
  });
});

describe("parseWrappedKeys", () => {
  it("reads a list of id=base64 pairs", () => {
    const keys = parseWrappedKeys(`k1=${W1}, k2=${W2}`);
    expect([...keys.keys()]).toEqual(["k1", "k2"]);
    expect(keys.get("k1")?.toString("base64")).toBe(W1);
  });

  it("refuses an empty list, a bad or repeated id, and anything that is not base64", () => {
    for (const bad of [
      "",
      ",",
      `K1=${W1}`,
      `=${W1}`,
      `k1 ${W1}`,
      `k1=${W1},k1=${W2}`,
      "k1=short",
      `k1=${"not base64 at all !!".repeat(4)}`,
      `bad id=${W1}`,
    ]) {
      expect(() => parseWrappedKeys(bad), bad).toThrow(/KMS_WRAPPED_KEYS/);
    }
  });
});

/** Behaves like KMS for our purposes: it only unwraps a key under the id it was made for. */
function standInKms() {
  const made = new Map<string, { id: string; key: Buffer }>();
  const client: KmsClient = {
    decrypt: async (wrapped, keyId) => {
      const entry = made.get(wrapped.toString("base64"));
      if (!entry || entry.id !== keyId) throw new Error("InvalidCiphertext");
      return entry.key;
    },
  };
  const wrap = (id: string) => {
    const wrapped = randomBytes(60);
    made.set(wrapped.toString("base64"), { id, key: randomBytes(32) });
    return wrapped.toString("base64");
  };
  return { client, wrap };
}

describe("encryption through the KMS provider", () => {
  it("encrypts with the current key and still decrypts values from an older key id", async () => {
    const { client, wrap } = standInKms();
    const a = wrap("k1");
    const b = wrap("k2");
    const old = new Crypto(
      createKmsKeyProvider({ region: "x", wrappedKeys: `k1=${a}`, currentKeyId: "k1", client }),
    );
    const sealed = await old.encrypt("blood pressure note", "notes.body:1");
    expect(sealed.startsWith("v1:k1:")).toBe(true);
    // After rotation both keys are known, the new one is current, and the old value still opens.
    const rotated = new Crypto(
      createKmsKeyProvider({
        region: "x",
        wrappedKeys: `k1=${a},k2=${b}`,
        currentKeyId: "k2",
        client,
      }),
    );
    expect(await rotated.decrypt(sealed, "notes.body:1")).toBe("blood pressure note");
    expect((await rotated.encrypt("new")).startsWith("v1:k2:")).toBe(true);
    expect(rotated.needsRotation(sealed)).toBe(true);
  });

  it("a wrapped key moved under another id does not unwrap, so its values do not decrypt", async () => {
    const { client, wrap } = standInKms();
    const a = wrap("k1");
    const writer = new Crypto(
      createKmsKeyProvider({ region: "x", wrappedKeys: `k1=${a}`, currentKeyId: "k1", client }),
    );
    const sealed = await writer.encrypt("secret");
    // Someone edits the settings so the same wrapped key is called k9, and rewrites the value's id.
    const thief = new Crypto(
      createKmsKeyProvider({ region: "x", wrappedKeys: `k9=${a}`, currentKeyId: "k9", client }),
    );
    expect(await thief.decrypt(sealed.replace(":k1:", ":k9:"))).toBeNull();
  });

  it("refuses to start when the current key id has no wrapped key", () => {
    const { client, wrap } = standInKms();
    expect(() =>
      createKmsKeyProvider({
        region: "x",
        wrappedKeys: `k1=${wrap("k1")}`,
        currentKeyId: "k2",
        client,
      }),
    ).toThrow(/current key id/);
  });
});

describe("cryptoFromConfig", () => {
  it("uses the local key on a developer machine, KMS when set, and nothing when neither is", () => {
    expect(cryptoFromConfig(loadConfig({ LOCAL_DEV_KEY: "k".repeat(40) }))).toBeInstanceOf(Crypto);
    expect(cryptoFromConfig(loadConfig({}))).toBeUndefined();
    const kms = loadConfig({
      CRYPTO_PROVIDER: "kms",
      KMS_KEY_ID: "alias/x",
      KMS_WRAPPED_KEYS: `k1=${W1}`,
      KMS_CURRENT_KEY_ID: "k1",
      S3_REGION: "ap-south-1",
    });
    expect(cryptoFromConfig(kms)).toBeInstanceOf(Crypto);
    // Incomplete KMS settings give nothing (production refuses to boot long before this).
    expect(
      cryptoFromConfig(loadConfig({ CRYPTO_PROVIDER: "kms", KMS_KEY_ID: "alias/x" })),
    ).toBeUndefined();
  });

  it("a malformed wrapped key stops the start-up instead of running without encryption", () => {
    const config = loadConfig({
      CRYPTO_PROVIDER: "kms",
      KMS_KEY_ID: "alias/x",
      KMS_WRAPPED_KEYS: "k1=short",
      KMS_CURRENT_KEY_ID: "k1",
      S3_REGION: "ap-south-1",
    });
    expect(() => cryptoFromConfig(config)).toThrow(/KMS_WRAPPED_KEYS/);
  });
});
