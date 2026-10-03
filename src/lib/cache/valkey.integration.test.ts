import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RateLimiter } from "../rate-limit/limiter";
import { RedisCache, cacheKey } from "./cache";

// Runs against a real Valkey. Skipped unless VALKEY_TEST_URL is set, for example
// after: docker compose -f docker/compose.yml up -d valkey
//        VALKEY_TEST_URL=redis://localhost:6379 pnpm test
const url = process.env.VALKEY_TEST_URL;

describe.skipIf(!url)("RedisCache against Valkey", () => {
  let cache: RedisCache;
  const run = `it${Date.now()}`;
  const key = (name: string) => cacheKey("test", run, name);

  beforeAll(() => {
    cache = new RedisCache({ url: url as string });
  });
  afterAll(async () => {
    await cache.close();
  });

  it("answers ping", async () => {
    await expect(cache.ping()).resolves.toBeUndefined();
  });

  it("stores, reads, expires and deletes", async () => {
    await cache.set(key("a"), "1", 150);
    expect(await cache.get(key("a"))).toBe("1");
    await new Promise((r) => setTimeout(r, 250));
    expect(await cache.get(key("a"))).toBeNull();
    await cache.set(key("b"), "2", 5000);
    await cache.del(key("b"));
    expect(await cache.get(key("b"))).toBeNull();
  });

  it("setIfAbsent lets exactly one of many concurrent callers win", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => cache.setIfAbsent(key("lock"), "x", 5000)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("incrWindow counts exactly under concurrency and sets one expiry", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => cache.incrWindow(key("ctr"), 5000)),
    );
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    const peek = await cache.peekWindow(key("ctr"));
    expect(peek.count).toBe(50);
    expect(peek.ttlMs).toBeGreaterThan(0);
    expect(peek.ttlMs).toBeLessThanOrEqual(5000);
  });

  it("the 6th request on a 5 per minute rule is refused and the state survives a new client", async () => {
    const rules = {
      public_read: [{ subject: "ip" as const, limit: 5, windowMs: 60_000 }],
    } as unknown as ConstructorParameters<typeof RateLimiter>[0]["rules"];
    const make = (c: RedisCache) =>
      new RateLimiter({ cache: c, env: `test${run}`, hashSecret: "s".repeat(32), rules });
    const first = make(cache);
    const input = { tier: "public_read" as const, route: "/x", ip: "7.7.7.7" };
    for (let i = 0; i < 5; i += 1) expect((await first.check(input)).allowed).toBe(true);

    const restarted = new RedisCache({ url: url as string }); // a new connection, like a restart
    try {
      const sixth = await make(restarted).check(input);
      expect(sixth.allowed).toBe(false);
      expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await restarted.close();
    }
  });

  it("fails fast when the server is unreachable", async () => {
    const dead = new RedisCache({ url: "redis://127.0.0.1:1" });
    await expect(dead.ping()).rejects.toThrow();
    await dead.close().catch(() => {});
  });
});
