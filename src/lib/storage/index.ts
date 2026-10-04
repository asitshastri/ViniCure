import { getConfig } from "../config/config";
import { errors } from "../errors/app-error";
import { globalSingleton } from "../singleton";
import { S3ObjectStore, StorageService } from "./storage";

// The process-wide storage service, built from configuration on first use. Where storage is not
// configured the request gets a plain "unavailable" answer; nothing falls back to local disk.

const holder = globalSingleton("storage", () => ({
  service: undefined as StorageService | undefined,
}));

export function getStorage(): StorageService {
  if (holder.service) return holder.service;
  const config = getConfig();
  if (!config.S3_BUCKET_FILES || !config.S3_BUCKET_EXPORTS || !config.S3_REGION) {
    throw errors.unavailable({ detail: "File storage is not available right now." });
  }
  holder.service = new StorageService(
    new S3ObjectStore({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
    }),
    {
      buckets: { files: config.S3_BUCKET_FILES, exports: config.S3_BUCKET_EXPORTS },
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
      signedUrlTtlSeconds: config.SIGNED_URL_TTL_SECONDS,
    },
  );
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setStorageForTest(service: StorageService | undefined): void {
  holder.service = service;
}
