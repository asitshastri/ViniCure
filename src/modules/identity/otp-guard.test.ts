import { beforeEach, describe, expect, it } from "vitest";
import { FakeCaptchaVerifier } from "../../lib/adapters/fakes";
import { MemoryCache } from "../../lib/cache/cache";
import { AppError } from "../../lib/errors/app-error";
import { RateLimiter } from "../../lib/rate-limit/limiter";
import { guardOtpRequest, type OtpGuardDeps } from "./otp-guard";

const NUMBER = "+919876543210";

function build(overrides: Partial<OtpGuardDeps> = {}) {
  const cache = new MemoryCache();
  const captcha = new FakeCaptchaVerifier();
  const alerts: string[] = [];
  const deps: OtpGuardDeps = {
    limiter: new RateLimiter({ cache, env: "test", hashSecret: "x".repeat(32) }),
    captcha,
    cache,
    env: "test",
    dailySmsCap: 100,
    allowedCountryCodes: ["+91"],
    production: true,
    trustedProxyHops: 1,
    alert: (event) => void alerts.push(event),
    ...overrides,
  };
  const send = (
    options: { phone?: unknown; ip?: string; token?: string | null; path?: string } = {},
  ) => {
    const token = options.token === undefined ? captcha.issue() : options.token;
    return guardOtpRequest(
      new Request(`https://vinicure.example/api/auth${options.path ?? "/phone-number/send-otp"}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": options.ip ?? "203.0.113.1",
          ...(token ? { "x-captcha-token": token } : {}),
        },
        body: JSON.stringify({ phoneNumber: "phone" in options ? options.phone : NUMBER }),
      }),
      deps,
    );
  };
  return { deps, send, captcha, alerts, cache };
}

async function code(promise: Promise<void>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof AppError ? error.code : `other:${String(error)}`;
  }
}

describe("send-otp abuse controls", () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  it("lets a normal request through", async () => {
    expect(await code(t.send())).toBe("ok");
  });

  it("limits one phone to 3 codes per 10 minutes, whatever the address", async () => {
    for (let i = 0; i < 3; i++)
      expect(await code(t.send({ ip: `203.0.113.${i + 10}` }))).toBe("ok");
    expect(await code(t.send({ ip: "203.0.113.99" }))).toBe("rate_limited");
  });

  it("limits one address to 10 codes per hour, whatever the phone", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await code(t.send({ phone: `+9198765432${String(i).padStart(2, "0")}` }))).toBe("ok");
    }
    expect(await code(t.send({ phone: "+919876543299" }))).toBe("rate_limited");
  });

  it("a forged left side of X-Forwarded-For does not change the address that is counted", async () => {
    for (let i = 0; i < 10; i++) {
      const request = new Request("https://vinicure.example/api/auth/phone-number/send-otp", {
        method: "POST",
        headers: {
          "x-forwarded-for": `10.0.0.${i}, 203.0.113.1`,
          "x-captcha-token": t.captcha.issue(),
        },
        body: JSON.stringify({ phoneNumber: `+9198765432${String(i).padStart(2, "0")}` }),
      });
      await guardOtpRequest(request, t.deps);
    }
    expect(await code(t.send({ phone: "+919876543299" }))).toBe("rate_limited");
  });

  it("requires a captcha token, and a token works once", async () => {
    expect(await code(t.send({ token: null }))).toBe("captcha_failed");
    expect(await code(t.send({ token: "forged" }))).toBe("captcha_failed");
    const token = t.captcha.issue();
    expect(await code(t.send({ token }))).toBe("ok");
    expect(await code(t.send({ token, phone: "+919876543211" }))).toBe("captcha_failed");
  });

  it("refuses a number that can never get a code, before spending anything", async () => {
    for (const phone of ["9876543210", "+14155552671", "+91123", 12345, null, undefined]) {
      expect(await code(t.send({ phone })), String(phone)).toBe("validation_failed");
    }
    // Nothing was sent to the budget or the captcha provider.
    const { count } = await t.cache.peekWindow(
      `vc:test:sms:budget:${new Date().toISOString().slice(0, 10)}`,
    );
    expect(count).toBe(0);
  });

  it("stops at the daily SMS budget, warns at 80 percent and alerts once", async () => {
    const small = build({ dailySmsCap: 5 });
    for (let i = 0; i < 5; i++) {
      expect(await code(small.send({ phone: `+9198765432${String(i).padStart(2, "0")}` }))).toBe(
        "ok",
      );
    }
    expect(small.alerts).toEqual(["sms_budget_warning"]);
    expect(await code(small.send({ phone: "+919876543250" }))).toBe("unavailable");
    expect(await code(small.send({ phone: "+919876543251" }))).toBe("unavailable");
    expect(small.alerts.filter((a) => a === "sms_budget_exhausted")).toHaveLength(1);
  });

  it("the budget resets the next UTC day", async () => {
    let now = new Date("2026-10-04T10:00:00Z");
    const small = build({ dailySmsCap: 1, now: () => now });
    expect(await code(small.send())).toBe("ok");
    expect(await code(small.send({ phone: "+919876543211" }))).toBe("unavailable");
    now = new Date("2026-10-05T00:01:00Z");
    expect(await code(small.send({ phone: "+919876543212", ip: "203.0.113.50" }))).toBe("ok");
  });

  it("refuses to send when the captcha provider is down (fail closed)", async () => {
    t.captcha.failures.failNext();
    expect(await code(t.send())).toBe("unavailable");
  });

  it("in production, refuses to send when no captcha is configured", async () => {
    const none = build({ captcha: undefined });
    expect(await code(none.send({ token: null }))).toBe("unavailable");
    expect(none.alerts).toContain("captcha_not_configured");
  });

  it("in development without a captcha secret, the check is skipped", async () => {
    const dev = build({ captcha: undefined, production: false });
    expect(await code(dev.send({ token: null }))).toBe("ok");
  });

  it("in production, refuses when the cache is down (fail closed)", async () => {
    const broken = build();
    broken.cache.incrWindow = async () => {
      throw new Error("cache down");
    };
    expect(await code(broken.send())).toBe("unavailable");
  });

  it("ignores other routes and other methods", async () => {
    const other = new Request("https://vinicure.example/api/auth/sign-out", { method: "POST" });
    await expect(guardOtpRequest(other, t.deps)).resolves.toBeUndefined();
    const get = new Request("https://vinicure.example/api/auth/phone-number/send-otp");
    await expect(guardOtpRequest(get, t.deps)).resolves.toBeUndefined();
  });

  it("rejects an oversized body", async () => {
    const request = new Request("https://vinicure.example/api/auth/phone-number/send-otp", {
      method: "POST",
      body: JSON.stringify({ phoneNumber: NUMBER, pad: "x".repeat(5000) }),
    });
    expect(await code(guardOtpRequest(request, t.deps))).toBe("payload_too_large");
  });
});

describe("verify abuse controls", () => {
  it("limits one phone to 10 checks per 10 minutes and needs no captcha", async () => {
    const t = build();
    for (let i = 0; i < 10; i++) {
      expect(
        await code(t.send({ path: "/phone-number/verify", token: null, ip: `203.0.113.${i}` })),
      ).toBe("ok");
    }
    expect(
      await code(t.send({ path: "/phone-number/verify", token: null, ip: "203.0.113.200" })),
    ).toBe("rate_limited");
  });

  it("limits one address to 30 checks per 10 minutes", async () => {
    const t = build();
    for (let i = 0; i < 30; i++) {
      expect(
        await code(
          t.send({
            path: "/phone-number/verify",
            token: null,
            phone: `+91987654${String(1000 + i)}`,
          }),
        ),
      ).toBe("ok");
    }
    expect(
      await code(t.send({ path: "/phone-number/verify", token: null, phone: "+919876549999" })),
    ).toBe("rate_limited");
  });

  it("verify attempts do not use up the SMS budget", async () => {
    const t = build({ dailySmsCap: 1 });
    for (let i = 0; i < 3; i++) await t.send({ path: "/phone-number/verify", token: null });
    expect(await code(t.send())).toBe("ok");
  });
});
