import { createHmac } from "node:crypto";
import { cacheKey, type CacheStore } from "../../../lib/cache/cache";
import { errors } from "../../../lib/errors/app-error";

// Guess limiter for recovery codes (P2-18). Five wrong codes within 15 minutes lock guessing for
// 15 minutes, per person. A recovery code has about 50 bits, so this makes guessing hopeless
// even for someone who holds a limited session. Fails closed: if the cache cannot be read, the
// attempt is refused.

export const MAX_WRONG = 5;
export const WINDOW_MS = 15 * 60_000;

export class CodeAttempts {
  constructor(
    private readonly cache: CacheStore,
    private readonly env: string,
    private readonly secret: string,
  ) {}

  private keys(userId: string): [string, string] {
    const id = createHmac("sha256", `attempts:${this.secret}`)
      .update(userId)
      .digest("hex")
      .slice(0, 32);
    return [
      cacheKey(this.env, "recovery", "fails", id),
      cacheKey(this.env, "recovery", "lock", id),
    ];
  }

  /** Throws 429 while locked (and 503 if the cache is down). */
  async assertOpen(userId: string): Promise<void> {
    const [, lockKey] = this.keys(userId);
    let lock;
    try {
      lock = await this.cache.peekWindow(lockKey);
    } catch (cause) {
      throw errors.unavailable({ cause });
    }
    if (lock.count > 0) throw errors.rateLimited(Math.ceil(lock.ttlMs / 1000));
  }

  async recordWrong(userId: string): Promise<void> {
    const [failsKey, lockKey] = this.keys(userId);
    const { count } = await this.cache.incrWindow(failsKey, WINDOW_MS);
    if (count >= MAX_WRONG) {
      await this.cache.incrWindow(lockKey, WINDOW_MS);
      await this.cache.del(failsKey);
    }
  }

  async recordRight(userId: string): Promise<void> {
    await this.cache.del(this.keys(userId)[0]);
  }
}
