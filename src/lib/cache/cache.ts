import { createHmac } from "node:crypto";
import { Redis } from "ioredis";

// Cache module (Valkey). Short-lived state only: rate-limit counters, idempotency
// records, OTP attempt counters, public read caches. Never patient data.
//
// Everything above this file talks to the CacheStore interface. RedisCache is
// the real Valkey client; MemoryCache is the in-process fake used by tests and
// by local development when no Valkey is running.

export interface CacheStore {
  get(key: string): Promise<string | null>;
  /** Stores a value that disappears after ttlMs. Every value must expire. */
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** Stores only if the key is free. True when this call stored it. */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomically adds one to a counter. The first increment starts the window. */
  incrWindow(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  /** Reads a counter without changing it. */
  peekWindow(key: string): Promise<{ count: number; ttlMs: number }>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const KEY_PART = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Builds a namespaced key: vc:{env}:{part}:{part}. Parts are restricted to a safe
 * alphabet so a caller cannot reach another module's keys. Personal data (phone,
 * email) must go through hashKeyPart first.
 */
export function cacheKey(env: string, ...parts: string[]): string {
  for (const part of parts) {
    if (!KEY_PART.test(part)) throw new Error("invalid cache key part");
  }
  return ["vc", env, ...parts].join(":");
}

/** Keyed hash for identifiers that must not appear raw in the cache, such as a phone number. */
export function hashKeyPart(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url").slice(0, 32);
}

// INCR and set the expiry on the first hit, in one atomic step.
const INCR_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

export type ValkeyOptions = { url: string; tls?: boolean };

export class RedisCache implements CacheStore {
  private readonly client: Redis;

  constructor(options: ValkeyOptions, client?: Redis) {
    this.client =
      client ??
      new Redis(options.url, {
        tls: options.tls ? {} : undefined,
        connectTimeout: 2000,
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
    // Connection errors surface as failed commands. Do not crash on the event.
    this.client.on("error", () => {});
  }

  /**
   * With the offline queue off, a command sent before the connection is ready fails at once.
   * Wait briefly for the first connection, but fail fast when the server is really down.
   */
  private async ready(): Promise<void> {
    if (this.client.status === "ready") return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.off("ready", onReady);
        reject(new Error("cache not connected"));
      }, 2000);
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      this.client.once("ready", onReady);
      if (this.client.status === "ready") onReady();
    });
  }

  async get(key: string) {
    await this.ready();
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlMs: number) {
    assertTtl(ttlMs);
    await this.ready();
    await this.client.set(key, value, "PX", ttlMs);
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    assertTtl(ttlMs);
    await this.ready();
    return (await this.client.set(key, value, "PX", ttlMs, "NX")) === "OK";
  }

  async del(key: string) {
    await this.ready();
    await this.client.del(key);
  }

  async incrWindow(key: string, windowMs: number) {
    assertTtl(windowMs);
    await this.ready();
    const [count, ttl] = (await this.client.eval(INCR_WINDOW, 1, key, String(windowMs))) as [
      number,
      number,
    ];
    return { count, ttlMs: ttl };
  }

  async peekWindow(key: string) {
    await this.ready();
    const [value, ttl] = await Promise.all([this.client.get(key), this.client.pttl(key)]);
    return { count: value ? Number(value) : 0, ttlMs: Math.max(0, ttl) };
  }

  async ping() {
    await this.ready();
    if ((await this.client.ping()) !== "PONG") throw new Error("cache ping failed");
  }

  async close() {
    await this.client.quit();
  }
}

function assertTtl(ttlMs: number) {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new Error("ttl must be a positive integer");
}

export type TimeSource = () => number;

/** In-process cache with the same behaviour as Valkey, including expiry. */
export class MemoryCache implements CacheStore {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();
  /** Test switch: every call fails like a cache outage. */
  down = false;

  constructor(private readonly now: TimeSource = Date.now) {}

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  private guard() {
    if (this.down) throw new Error("cache unavailable (fake)");
  }

  async get(key: string) {
    this.guard();
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs: number) {
    this.guard();
    assertTtl(ttlMs);
    this.data.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    this.guard();
    assertTtl(ttlMs);
    if (this.live(key)) return false;
    this.data.set(key, { value, expiresAt: this.now() + ttlMs });
    return true;
  }

  async del(key: string) {
    this.guard();
    this.data.delete(key);
  }

  async incrWindow(key: string, windowMs: number) {
    this.guard();
    assertTtl(windowMs);
    const entry = this.live(key);
    if (!entry) {
      this.data.set(key, { value: "1", expiresAt: this.now() + windowMs });
      return { count: 1, ttlMs: windowMs };
    }
    entry.value = String(Number(entry.value) + 1);
    return { count: Number(entry.value), ttlMs: entry.expiresAt - this.now() };
  }

  async peekWindow(key: string) {
    this.guard();
    const entry = this.live(key);
    return entry
      ? { count: Number(entry.value), ttlMs: entry.expiresAt - this.now() }
      : { count: 0, ttlMs: 0 };
  }

  async ping() {
    this.guard();
  }

  async close() {}
}
