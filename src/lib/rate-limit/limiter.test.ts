import { beforeEach, describe, expect, it } from "vitest";
import { configureApi, resetApiConfig } from "../api/deps";
import { clearRoutesForTest } from "../api/registry";
import { RATE_LIMIT_TIERS, type RateLimitTier } from "../api/types";
import { withApi } from "../api/with-api";
import { MemoryCache, cacheKey, hashKeyPart } from "../cache/cache";
import { RateLimiter, TIER_RULES, type Rule } from "./limiter";

let now = 1_000_000;
const clockCache = () => new MemoryCache(() => now);

const FIVE_PER_MINUTE = Object.fromEntries(
  RATE_LIMIT_TIERS.map((tier) => [tier, [{ subject: "ip", limit: 5, windowMs: 60_000 }] as Rule[]]),
) as Record<RateLimitTier, Rule[]>;

const make = (cache = clockCache(), rules?: Record<RateLimitTier, Rule[]>) =>
  new RateLimiter({ cache, env: "test", hashSecret: "s".repeat(32), rules });

const input = (tier: RateLimitTier, extra = {}) => ({ tier, route: "/x", ip: "9.9.9.9", ...extra });

beforeEach(() => {
  now = 1_000_000;
});

describe("tiers", () => {
  it("matches the table in the architecture doc", () => {
    expect(TIER_RULES.public_read).toEqual([{ subject: "ip", limit: 120, windowMs: 60_000 }]);
    expect(TIER_RULES.auth_read[0]).toMatchObject({ subject: "user", limit: 300 });
    expect(TIER_RULES.write[0]).toMatchObject({ subject: "user", limit: 60 });
    expect(TIER_RULES.otp_send).toEqual([
      { subject: "phone", limit: 3, windowMs: 600_000 },
      { subject: "ip", limit: 10, windowMs: 3_600_000 },
    ]);
    expect(TIER_RULES.otp_verify[0]).toMatchObject({
      subject: "phone",
      limit: 10,
      windowMs: 600_000,
    });
    expect(TIER_RULES.payments[0]).toMatchObject({ limit: 10 });
    expect(TIER_RULES.ai[0]).toMatchObject({ limit: 5, windowMs: 3_600_000 });
    expect(TIER_RULES.admin[0]).toMatchObject({ limit: 120 });
  });
});

describe("limiting", () => {
  it("the 6th rapid request on a 5 per minute tier is refused with Retry-After", async () => {
    const limiter = make(clockCache(), FIVE_PER_MINUTE);
    for (let i = 1; i <= 5; i += 1) {
      expect((await limiter.check(input("public_read"))).allowed).toBe(true);
    }
    const sixth = await limiter.check(input("public_read"));
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(sixth.limit).toBe(5);
  });

  it("starts a new window after it ends", async () => {
    const limiter = make(clockCache(), FIVE_PER_MINUTE);
    for (let i = 0; i < 6; i += 1) await limiter.check(input("public_read"));
    now += 60_001;
    expect((await limiter.check(input("public_read"))).allowed).toBe(true);
  });

  it("counts addresses separately", async () => {
    const limiter = make(clockCache(), FIVE_PER_MINUTE);
    for (let i = 0; i < 6; i += 1) await limiter.check(input("public_read"));
    expect((await limiter.check(input("public_read", { ip: "8.8.8.8" }))).allowed).toBe(true);
  });

  it("state survives an app restart because it lives in the cache", async () => {
    const cache = clockCache();
    const before = make(cache, FIVE_PER_MINUTE);
    for (let i = 0; i < 5; i += 1) await before.check(input("public_read"));
    const afterRestart = make(cache, FIVE_PER_MINUTE); // a new limiter object, same cache
    expect((await afterRestart.check(input("public_read"))).allowed).toBe(false);
  });

  it("limits signed-in users by user id, not shared address", async () => {
    const limiter = make(clockCache(), {
      ...FIVE_PER_MINUTE,
      write: [{ subject: "user", limit: 2, windowMs: 60_000 }],
    });
    const a = (n: string) => input("write", { userId: n });
    await limiter.check(a("u1"));
    await limiter.check(a("u1"));
    expect((await limiter.check(a("u1"))).allowed).toBe(false);
    expect((await limiter.check(a("u2"))).allowed).toBe(true);
  });

  it("before sign-in a user-scoped tier is guarded by address with a higher floor", async () => {
    const limiter = make(clockCache(), {
      ...FIVE_PER_MINUTE,
      write: [{ subject: "user", limit: 2, windowMs: 60_000 }],
    });
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) if ((await limiter.check(input("write"))).allowed) allowed += 1;
    expect(allowed).toBe(10);
  });
});

describe("OTP phone limits", () => {
  it("allows 3 sends per phone per 10 minutes, then refuses with a wait time", async () => {
    const limiter = make();
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.checkPhone({ tier: "otp_send", phone: "+919812345678" })).allowed).toBe(
        true,
      );
    }
    const fourth = await limiter.checkPhone({ tier: "otp_send", phone: "+919812345678" });
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(500);
    expect((await limiter.checkPhone({ tier: "otp_send", phone: "+919800000000" })).allowed).toBe(
      true,
    );
  });

  it("limits one address to 10 sends per hour through the normal hook", async () => {
    const limiter = make();
    let allowed = 0;
    for (let i = 0; i < 12; i += 1)
      if ((await limiter.check(input("otp_send"))).allowed) allowed += 1;
    expect(allowed).toBe(10);
  });

  it("never stores a raw phone number in the cache", async () => {
    const cache = clockCache();
    await make(cache).checkPhone({ tier: "otp_send", phone: "+919812345678" });
    const hashed = hashKeyPart("+919812345678", "s".repeat(32));
    const key = cacheKey("test", "rl", "otp_send", "phone", "600000", hashed);
    expect((await cache.peekWindow(key)).count).toBe(1);
    expect(key).not.toContain("9812345678");
  });
});

describe("cache outage with withApi()", () => {
  beforeEach(() => {
    clearRoutesForTest();
    resetApiConfig();
  });

  const run = async (tier: RateLimitTier) => {
    const cache = new MemoryCache();
    cache.down = true;
    configureApi({ production: true, rateLimit: make(cache).check });
    const route = withApi(
      { method: "GET", path: `/api/v1/${tier}`, auth: "public", rateLimit: tier },
      () => ({ ok: true }),
    );
    return route(new Request(`http://x.test/api/v1/${tier}`));
  };

  it.each(["otp_send", "otp_verify", "payments", "admin"] as const)(
    "%s fails closed when the cache is down",
    async (tier) => {
      expect((await run(tier)).status).toBe(503);
    },
  );

  it.each(["public_read", "auth_read", "write", "ai"] as const)(
    "%s fails open when the cache is down",
    async (tier) => {
      // auth_read, write and ai are public in this test route, so only the limiter is exercised.
      expect((await run(tier)).status).toBe(200);
    },
  );

  it("a refused request carries the standard headers", async () => {
    configureApi({ production: false, rateLimit: make(clockCache(), FIVE_PER_MINUTE).check });
    const route = withApi(
      { method: "GET", path: "/api/v1/h", auth: "public", rateLimit: "public_read" },
      () => ({}),
    );
    let res = new Response();
    for (let i = 0; i < 6; i += 1) res = await route(new Request("http://x.test/api/v1/h"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("RateLimit-Limit")).toBe("5");
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
    expect((await res.json()).code).toBe("rate_limited");
  });
});

describe("cache keys", () => {
  it("rejects parts that could escape the namespace", () => {
    expect(() => cacheKey("test", "ok", "bad part")).toThrow();
    expect(() => cacheKey("test", "a*")).toThrow();
    expect(() => cacheKey("test", "")).toThrow();
    expect(cacheKey("test", "rl", "x")).toBe("vc:test:rl:x");
  });
});
