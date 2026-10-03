import type { Config } from "../config/config";
import { registerReadinessCheck } from "../health/checks";
import { globalSingleton } from "../singleton";
import { logger } from "../logging/logger";
import { MemoryCache, RedisCache, type CacheStore } from "./cache";

export * from "./cache";

const holder = globalSingleton("cache", () => ({ shared: undefined as CacheStore | undefined }));

/** Builds the cache for this process: Valkey when VALKEY_URL is set, otherwise in-memory (development only). */
export function createCache(
  config: Pick<Config, "VALKEY_URL" | "VALKEY_TLS" | "NODE_ENV">,
): CacheStore {
  if (config.VALKEY_URL) return new RedisCache({ url: config.VALKEY_URL, tls: config.VALKEY_TLS });
  if (config.NODE_ENV === "production") throw new Error("VALKEY_URL is required in production");
  logger.warn({ event: "cache_in_memory", note: "VALKEY_URL not set; counters reset on restart" });
  return new MemoryCache();
}

export function configureCache(cache: CacheStore): void {
  holder.shared = cache;
  registerReadinessCheck("cache", () => cache.ping());
}

export function getCache(): CacheStore {
  if (!holder.shared) throw new Error("cache is not configured");
  return holder.shared;
}
