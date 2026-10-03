import { createHash } from "node:crypto";
import type { IdempotencyRunner } from "../api/deps";
import { AppError } from "../errors/app-error";
import type { CacheStore } from "../cache/cache";
import { cacheKey } from "../cache/cache";
import type { Crypto } from "../crypto/crypto";
import { logger as defaultLogger } from "../logging/logger";
import type { Logger } from "pino";

// Idempotency for booking and payment writes (backend-architecture.md section 5).
//
// Same key and same request  -> the stored response is replayed.
// Same key, different request -> 422 idempotency_conflict.
// Same key while the first is still running -> 409 conflict (try again shortly).
//
// Two layers: Valkey holds the fast lock and state (no response bodies, because
// the cache holds no patient data); the durable store (Postgres table
// idempotency_keys) holds the response, encrypted, for 24 hours.

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A request that never finished frees its key after this long. */
export const IN_PROGRESS_TTL_MS = 60 * 1000;
/** Responses larger than this are not stored; the retry then gets a conflict. */
export const MAX_STORED_BODY_BYTES = 256 * 1024;

export type StoredRecord = {
  scopeHash: string;
  requestHash: string;
  state: "in_progress" | "completed";
  responseStatus?: number;
  responseContentType?: string;
  /** Response body, encrypted with the crypto module. */
  responseBodyEnc?: string | null;
  expiresAt: Date;
};

export interface DurableStore {
  /** Creates the record if the key is free (or expired). True when this call created it. */
  insertIfAbsent(record: StoredRecord): Promise<boolean>;
  get(scopeHash: string): Promise<StoredRecord | null>;
  complete(
    scopeHash: string,
    result: { responseStatus: number; responseContentType: string; responseBodyEnc: string | null },
  ): Promise<void>;
  remove(scopeHash: string): Promise<void>;
}

/** In-memory store for tests and local development. Production uses the Postgres store (P1-17 era). */
export class MemoryDurableStore implements DurableStore {
  readonly records = new Map<string, StoredRecord>();
  constructor(private readonly now: () => number = Date.now) {}

  private live(scopeHash: string): StoredRecord | undefined {
    const record = this.records.get(scopeHash);
    if (record && record.expiresAt.getTime() <= this.now()) {
      this.records.delete(scopeHash);
      return undefined;
    }
    return record;
  }

  async insertIfAbsent(record: StoredRecord) {
    if (this.live(record.scopeHash)) return false;
    this.records.set(record.scopeHash, { ...record });
    return true;
  }
  async get(scopeHash: string) {
    const record = this.live(scopeHash);
    return record ? { ...record } : null;
  }
  async complete(
    scopeHash: string,
    result: { responseStatus: number; responseContentType: string; responseBodyEnc: string | null },
  ) {
    const record = this.records.get(scopeHash);
    if (!record) return;
    this.records.set(scopeHash, {
      ...record,
      state: "completed",
      ...result,
      expiresAt: new Date(this.now() + IDEMPOTENCY_TTL_MS),
    });
  }
  async remove(scopeHash: string) {
    this.records.delete(scopeHash);
  }
}

export type IdempotencyOptions = {
  cache: CacheStore;
  store: DurableStore;
  crypto: Crypto;
  env: string;
  now?: () => number;
  logger?: Logger;
};

/** The key is scoped to the caller and the route, and only a hash of it is stored. */
export function scopeHashOf(actorId: string | null, route: string, key: string): string {
  return createHash("sha256")
    .update(`${actorId ?? "anonymous"}\n${route}\n${key}`)
    .digest("hex");
}

const TOO_LARGE = "application/x-not-stored";
const REPLAY_HEADERS = ["content-type"] as const;

export function createIdempotency(options: IdempotencyOptions): IdempotencyRunner {
  const now = options.now ?? Date.now;
  const logger = options.logger ?? defaultLogger;
  const { cache, store, crypto } = options;

  const stateKey = (scopeHash: string) => cacheKey(options.env, "idem", scopeHash);

  async function replay(record: StoredRecord, scopeHash: string): Promise<Response> {
    const body = record.responseBodyEnc
      ? await crypto.decrypt(record.responseBodyEnc, `idempotency:${scopeHash}`)
      : null;
    if (record.responseContentType === TOO_LARGE || (record.responseBodyEnc && body === null)) {
      // Cannot decrypt: do not guess. The caller can check the booking itself.
      throw new AppError("conflict", { detail: "This request was already processed." });
    }
    const response = new Response(body, {
      status: record.responseStatus ?? 200,
      headers: record.responseContentType ? { "Content-Type": record.responseContentType } : {},
    });
    response.headers.set("Idempotent-Replayed", "true");
    return response;
  }

  return async ({ key, actorId, route, requestHash, execute }) => {
    const scopeHash = scopeHashOf(actorId, route, key);

    // Fast path: the cache already knows this key with a different request.
    const cached = await cache.get(stateKey(scopeHash));
    if (cached !== null && cached !== requestHash) throw new AppError("idempotency_conflict");

    const existing = await store.get(scopeHash);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AppError("idempotency_conflict");
      if (existing.state === "completed") return replay(existing, scopeHash);
      throw new AppError("conflict", {
        detail: "The same request is still being processed. Try again shortly.",
        headers: { "Retry-After": "1" },
      });
    }

    // Fast lock in the cache, then the durable record. Either loser sees a conflict.
    const locked = await cache.setIfAbsent(stateKey(scopeHash), requestHash, IN_PROGRESS_TTL_MS);
    const created =
      locked &&
      (await store.insertIfAbsent({
        scopeHash,
        requestHash,
        state: "in_progress",
        expiresAt: new Date(now() + IN_PROGRESS_TTL_MS),
      }));
    if (!created) {
      if (locked) await cache.del(stateKey(scopeHash));
      throw new AppError("conflict", {
        detail: "The same request is still being processed. Try again shortly.",
        headers: { "Retry-After": "1" },
      });
    }

    let response: Response;
    try {
      response = await execute();
    } catch (error) {
      // The attempt failed before an answer existed: free the key so a retry can run.
      await store.remove(scopeHash);
      await cache.del(stateKey(scopeHash));
      throw error;
    }

    if (response.status >= 500) {
      await store.remove(scopeHash);
      await cache.del(stateKey(scopeHash));
      return response;
    }

    const text = await response.clone().text();
    const tooLarge = Buffer.byteLength(text) > MAX_STORED_BODY_BYTES;
    if (tooLarge) logger.warn({ event: "idempotency_body_too_large", route });
    const bodyEnc =
      tooLarge || text === "" ? null : await crypto.encrypt(text, `idempotency:${scopeHash}`);
    await store.complete(scopeHash, {
      responseStatus: response.status,
      responseContentType: tooLarge
        ? TOO_LARGE
        : (REPLAY_HEADERS.map((h) => response.headers.get(h)).find(Boolean) ?? "application/json"),
      responseBodyEnc: bodyEnc,
    });
    // Keep the cache marker for the full period so the cheap check stays cheap.
    await cache.set(stateKey(scopeHash), requestHash, IDEMPOTENCY_TTL_MS);
    return response;
  };
}
