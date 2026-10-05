import type { Config } from "../config/config";
import { Crypto, LocalKeyProvider } from "./crypto";
import { createKmsKeyProvider } from "./kms";

/**
 * The encryption for this process, from settings: KMS-wrapped data keys in production, a local
 * key on a developer machine. Returns undefined when neither is set (development only; the
 * production configuration refuses that). A bad or missing wrapped key stops the start-up.
 */
export function cryptoFromConfig(config: Config): Crypto | undefined {
  if (config.CRYPTO_PROVIDER === "kms") {
    const region = config.KMS_REGION ?? config.S3_REGION;
    if (!region || !config.KMS_WRAPPED_KEYS || !config.KMS_CURRENT_KEY_ID) return undefined;
    return new Crypto(
      createKmsKeyProvider({
        region,
        wrappedKeys: config.KMS_WRAPPED_KEYS,
        currentKeyId: config.KMS_CURRENT_KEY_ID,
      }),
    );
  }
  if (config.LOCAL_DEV_KEY) return new Crypto(new LocalKeyProvider(config.LOCAL_DEV_KEY));
  return undefined;
}
