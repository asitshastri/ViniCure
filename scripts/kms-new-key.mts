import { AwsKmsClient } from "../src/lib/crypto/kms";

// Makes a new data key for the application and prints it in its wrapped form. KMS generates the
// key and returns only the wrapped copy; the plaintext key is never shown to anyone. Put the line
// it prints into the server's settings (KMS_WRAPPED_KEYS), and set KMS_CURRENT_KEY_ID to the id.
//
//   KMS_KEY_ID=alias/vinicure-test KMS_REGION=ap-south-1 pnpm kms:new-key k1
//
// To rotate, run it again with a new id (k2) and append: KMS_WRAPPED_KEYS="k1=...,k2=..." and set
// KMS_CURRENT_KEY_ID=k2. Older values keep decrypting with their own id.
// Needs AWS credentials that may call kms:GenerateDataKeyWithoutPlaintext on the key.
const keyId = process.argv[2] ?? "k1";
const kmsKey = process.env.KMS_KEY_ID;
const region = process.env.KMS_REGION ?? process.env.S3_REGION;
if (!kmsKey || !region) {
  console.error("Set KMS_KEY_ID (the KMS key or alias) and KMS_REGION (for example ap-south-1).");
  process.exit(1);
}
const wrapped = await new AwsKmsClient({ region }).newWrappedKey(kmsKey, keyId);
console.log(`KMS_WRAPPED_KEYS=${keyId}=${wrapped.toString("base64")}`);
console.log(`KMS_CURRENT_KEY_ID=${keyId}`);
console.error(
  "Made. Keep these two lines with the other server settings (they are safe to store: the key is wrapped).",
);
