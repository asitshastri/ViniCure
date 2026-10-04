import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCache } from "../../lib/cache/cache";
import { AppError } from "../../lib/errors/app-error";
import { RateLimiter } from "../../lib/rate-limit/limiter";
import {
  BASE_LOCK_MS,
  FAILURE_WINDOW_MS,
  MAX_FAILURES,
  MIN_RESET_RESPONSE_MS,
  guardSignIn,
  type SignInGuardDeps,
} from "./sign-in-guard";

const URL_ = "https://vinicure.example/api/auth/sign-in/email";

let now = 0;
let cache: MemoryCache;
let alerts: string[];
let deps: SignInGuardDeps;

beforeEach(() => {
  now = 1_000_000;
  cache = new MemoryCache(() => now);
  alerts = [];
  deps = {
    limiter: new RateLimiter({ cache, env: "t", hashSecret: "h".repeat(32) }),
    cache,
    env: "t",
    hashSecret: "s".repeat(32),
    production: true,
    trustedProxyHops: 1,
    alert: (event) => void alerts.push(event),
  };
});

const attempt = (
  email: string,
  ip = "203.0.113.1",
  path = "/api/auth/sign-in/email",
  cookie?: string,
) =>
  new Request(`https://vinicure.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ email }),
  });

/** Runs one attempt with the given outcome. Returns "ok" or the error code. */
async function run(email: string, outcome: 200 | 401, ip?: string): Promise<string> {
  try {
    const after = await guardSignIn(attempt(email, ip), deps);
    await after?.(new Response(null, { status: outcome }));
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : "error";
  }
}

describe("account lock-out", () => {
  it("locks password sign-in after 5 wrong passwords, for 15 minutes, with Retry-After", async () => {
    for (let i = 0; i < MAX_FAILURES; i++)
      expect(await run("dr@example.com", 401, `198.51.100.${i}`)).toBe("ok");
    expect(alerts).toContain("signin_locked");
    let error: AppError | undefined;
    try {
      await guardSignIn(attempt("dr@example.com", "198.51.100.77"), deps);
    } catch (e) {
      error = e as AppError;
    }
    expect(error?.code).toBe("rate_limited");
    expect(Number(error?.headers?.["Retry-After"])).toBeGreaterThan(14 * 60);
    expect(Number(error?.headers?.["Retry-After"])).toBeLessThanOrEqual(15 * 60);
  });

  it("even the right password is refused while locked, and works again after the time passes", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await run("dr@example.com", 401, `198.51.100.${i}`);
    expect(await run("dr@example.com", 200, "198.51.100.50")).toBe("rate_limited");
    now += BASE_LOCK_MS + 1000;
    expect(await run("dr@example.com", 200, "198.51.100.51")).toBe("ok");
  });

  it("case and spacing in the email do not give a fresh count", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await run(i % 2 ? "DR@Example.com" : " dr@example.com ", 401, `198.51.100.${i}`);
    }
    expect(await run("dr@example.com", 200, "198.51.100.60")).toBe("rate_limited");
  });

  it("failures older than 15 minutes are forgotten", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await run("dr@example.com", 401, `198.51.100.${i}`);
    now += FAILURE_WINDOW_MS + 1000;
    for (let i = 0; i < MAX_FAILURES - 1; i++)
      await run("dr@example.com", 401, `198.51.100.${i + 20}`);
    expect(await run("dr@example.com", 200, "198.51.100.70")).toBe("ok");
  });

  it("a correct password clears the failure count", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await run("dr@example.com", 401, `198.51.100.${i}`);
    expect(await run("dr@example.com", 200, "198.51.100.40")).toBe("ok");
    for (let i = 0; i < MAX_FAILURES - 1; i++)
      expect(await run("dr@example.com", 401, `198.51.100.${i + 30}`)).toBe("ok");
    expect(await run("dr@example.com", 200, "198.51.100.41")).toBe("ok"); // still not locked
  });

  it("each repeated lock-out within a day doubles the time, up to 24 hours", async () => {
    const lockSeconds: number[] = [];
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < MAX_FAILURES; i++)
        await run("dr@example.com", 401, `198.51.100.${round * 10 + i}`);
      let retry = 0;
      try {
        await guardSignIn(attempt("dr@example.com", "198.51.100.99"), deps);
      } catch (e) {
        retry = Number((e as AppError).headers?.["Retry-After"]);
      }
      lockSeconds.push(retry);
      now += retry * 1000 + 1000;
    }
    expect(lockSeconds[0]).toBeLessThanOrEqual(15 * 60);
    expect(lockSeconds[1]).toBeGreaterThan(29 * 60);
    expect(lockSeconds[1]).toBeLessThanOrEqual(30 * 60);
    expect(lockSeconds[2]).toBeGreaterThan(59 * 60);
    expect(lockSeconds[2]).toBeLessThanOrEqual(60 * 60);
  });

  it("an email with no account is counted and locked exactly like a real one (no account probing)", async () => {
    for (let i = 0; i < MAX_FAILURES; i++)
      await run("nobody-here@example.com", 401, `198.51.100.${i}`);
    expect(await run("nobody-here@example.com", 401, "198.51.100.80")).toBe("rate_limited");
  });

  it("one locked account does not lock another", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await run("a@example.com", 401, `198.51.100.${i}`);
    expect(await run("b@example.com", 200, "198.51.100.90")).toBe("ok");
  });
});

describe("address limit", () => {
  it("30 attempts from one address in 15 minutes, then 429, even for different emails", async () => {
    for (let i = 0; i < 30; i++)
      expect(await run(`user${i}@example.com`, 200, "203.0.113.5")).toBe("ok");
    expect(await run("another@example.com", 200, "203.0.113.5")).toBe("rate_limited");
    expect(await run("another@example.com", 200, "203.0.113.6")).toBe("ok");
  });

  it("a forged X-Forwarded-For does not reset the address", async () => {
    for (let i = 0; i < 30; i++) {
      await guardSignIn(
        new Request(URL_, {
          method: "POST",
          headers: { "x-forwarded-for": `10.0.0.${i}, 203.0.113.9` },
          body: JSON.stringify({ email: `u${i}@example.com` }),
        }),
        deps,
      );
    }
    expect(await run("x@example.com", 200, "203.0.113.9")).toBe("rate_limited");
  });
});

describe("change password", () => {
  const change = (cookie: string) =>
    attempt("", "203.0.113.1", "/api/auth/change-password", cookie);

  it("counts wrong current passwords per session and locks after 5", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      const after = await guardSignIn(change("vc_session=abc"), deps);
      await after?.(new Response(null, { status: 400 }));
    }
    await expect(guardSignIn(change("vc_session=abc"), deps)).rejects.toMatchObject({
      code: "rate_limited",
    });
    await expect(guardSignIn(change("vc_session=other"), deps)).resolves.toBeTruthy();
  });
});

describe("failure behaviour and scope", () => {
  it("in production a cache outage refuses password sign-in; in development it passes", async () => {
    deps.cache.incrWindow = async () => {
      throw new Error("cache down");
    };
    deps.cache.peekWindow = async () => {
      throw new Error("cache down");
    };
    await expect(guardSignIn(attempt("a@example.com"), deps)).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(
      guardSignIn(attempt("a@example.com"), { ...deps, production: false }),
    ).resolves.toBeNull();
    expect(alerts).toContain("signin_guard_unavailable");
  });

  it("ignores other routes and methods, and a body with no email", async () => {
    expect(
      await guardSignIn(attempt("a@example.com", "1.1.1.1", "/api/auth/sign-out"), deps),
    ).toBeNull();
    expect(await guardSignIn(new Request(URL_), deps)).toBeNull();
    const noEmail = new Request(URL_, { method: "POST", body: "{}" });
    expect(await guardSignIn(noEmail, deps)).toBeNull();
    const notJson = new Request(URL_, { method: "POST", body: "nope" });
    expect(await guardSignIn(notJson, deps)).toBeNull();
  });

  it("an oversized body is refused before it is read", async () => {
    const big = new Request(URL_, {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", pad: "x".repeat(6000) }),
    });
    await expect(guardSignIn(big, deps)).rejects.toMatchObject({ code: "payload_too_large" });
  });
});

describe("password reset requests (P2-16)", () => {
  const resetRequest = (email: string, ip = "203.0.113.1") =>
    attempt(email, ip, "/api/auth/request-password-reset");

  async function ask(email: string, ip?: string): Promise<string> {
    try {
      const after = await guardSignIn(resetRequest(email, ip), deps);
      await after?.(new Response(null, { status: 200 }));
      return "ok";
    } catch (e) {
      return e instanceof AppError ? e.code : "error";
    }
  }

  it("allows 3 requests per 15 minutes per address, then 429 whatever the email", async () => {
    for (let i = 0; i < 3; i++) expect(await ask(`dr${i}@example.com`, "203.0.113.20")).toBe("ok");
    expect(await ask("dr9@example.com", "203.0.113.20")).toBe("rate_limited");
    expect(await ask("dr9@example.com", "203.0.113.21")).toBe("ok"); // another address is not affected
  });

  it("the address allowance returns after 15 minutes", async () => {
    for (let i = 0; i < 3; i++) await ask(`dr${i}@example.com`, "203.0.113.30");
    expect(await ask("x@example.com", "203.0.113.30")).toBe("rate_limited");
    now += FAILURE_WINDOW_MS + 1000;
    expect(await ask("x@example.com", "203.0.113.30")).toBe("ok");
  });

  it("one email gets at most 3 reset emails an hour, however many addresses ask", async () => {
    for (let i = 0; i < 3; i++)
      expect(await ask("dr@example.com", `203.0.113.${40 + i}`)).toBe("ok");
    expect(await ask("dr@example.com", "203.0.113.50")).toBe("rate_limited");
    expect(await ask("Dr@Example.com ", "203.0.113.51")).toBe("rate_limited"); // spelling does not matter
    expect(await ask("other@example.com", "203.0.113.52")).toBe("ok");
  });

  it("an address with no account is counted exactly like a real one", async () => {
    for (let i = 0; i < 3; i++)
      expect(await ask("ghost@example.com", `203.0.113.${60 + i}`)).toBe("ok");
    expect(await ask("ghost@example.com", "203.0.113.70")).toBe("rate_limited");
  });

  it("every request takes at least the minimum time, so timing reveals nothing", async () => {
    const started = Date.now();
    await ask("quick@example.com", "203.0.113.80");
    expect(Date.now() - started).toBeGreaterThanOrEqual(MIN_RESET_RESPONSE_MS - 20);
  });

  it("the reset step itself is limited by address only, and fails closed without the cache", async () => {
    const reset = () => attempt("", "203.0.113.90", "/api/auth/reset-password");
    for (let i = 0; i < 30; i++) await guardSignIn(reset(), deps);
    await expect(guardSignIn(reset(), deps)).rejects.toMatchObject({ code: "rate_limited" });
    deps.cache.incrWindow = async () => {
      throw new Error("down");
    };
    await expect(
      guardSignIn(attempt("a@b.co", "203.0.113.91", "/api/auth/request-password-reset"), deps),
    ).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
