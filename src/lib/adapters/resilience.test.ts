import { describe, expect, it } from "vitest";
import { FakeFileScanner, FakePaymentProvider, FakeSmsProvider } from "./fakes";
import { protect, Resilience, type Clock, type MetricEvent } from "./resilience";
import { AdapterError } from "./types";

function fakeClock() {
  let now = 1_000_000;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  };
  return { clock, advance: (ms: number) => (now += ms), sleeps };
}

function setup(breaker = { failureThreshold: 3, openMs: 10_000 }) {
  const time = fakeClock();
  const events: MetricEvent[] = [];
  const resilience = new Resilience({
    provider: "test",
    breaker,
    clock: time.clock,
    metrics: (event) => events.push(event),
    random: () => 0.5,
  });
  return { resilience, events, ...time };
}

const down = () => Promise.reject(new AdapterError("unavailable", "down"));

describe("timeout", () => {
  it("fails a slow call as unavailable and counts a timeout", async () => {
    const { resilience, events } = setup();
    const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200));
    await expect(resilience.call("send", slow, { timeoutMs: 20 })).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(events).toContain("timeout");
  });
});

describe("retries", () => {
  it("retries an idempotent call and succeeds on recovery", async () => {
    const { resilience, events, sleeps } = setup();
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 3) throw new AdapterError("unavailable", "blip");
      return "ok";
    };
    await expect(
      resilience.call("fetch", flaky, { timeoutMs: 100, idempotent: true }),
    ).resolves.toBe("ok");
    expect(calls).toBe(3);
    expect(events.filter((e) => e === "retry")).toHaveLength(2);
    expect(sleeps).toEqual([200, 400]);
  });

  it("never retries a call that is not idempotent", async () => {
    const { resilience } = setup();
    let calls = 0;
    await expect(
      resilience.call("send", async () => (calls++, down()), { timeoutMs: 100 }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toBe(1);
  });

  it("does not retry or count a provider refusal", async () => {
    const { resilience, events } = setup();
    let calls = 0;
    const refuse = async () => {
      calls += 1;
      throw new AdapterError("rejected", "no");
    };
    for (let i = 0; i < 10; i += 1) {
      await expect(
        resilience.call("fetch", refuse, { timeoutMs: 100, idempotent: true }),
      ).rejects.toMatchObject({ kind: "rejected" });
    }
    expect(calls).toBe(10);
    expect(events).not.toContain("circuit_open");
  });
});

describe("circuit breaker", () => {
  it("opens after the threshold, rejects without calling, then recovers through one probe", async () => {
    const { resilience, events, advance } = setup();
    let calls = 0;
    const fail = async () => (calls++, down());
    for (let i = 0; i < 3; i += 1) {
      await expect(resilience.call("send", fail, { timeoutMs: 100 })).rejects.toBeInstanceOf(
        AdapterError,
      );
    }
    expect(resilience.breaker.current).toBe("open");
    expect(events).toContain("circuit_open");

    // Open: the provider is not called.
    await expect(resilience.call("send", fail, { timeoutMs: 100 })).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(calls).toBe(3);
    expect(events).toContain("circuit_rejected");

    // After the wait, one probe goes through. A success closes the circuit.
    advance(10_001);
    await expect(resilience.call("send", async () => "ok", { timeoutMs: 100 })).resolves.toBe("ok");
    expect(resilience.breaker.current).toBe("closed");
  });

  it("a failed probe reopens the circuit", async () => {
    const { resilience, advance } = setup();
    for (let i = 0; i < 3; i += 1)
      await resilience.call("s", down, { timeoutMs: 100 }).catch(() => {});
    advance(10_001);
    await resilience.call("s", down, { timeoutMs: 100 }).catch(() => {});
    expect(resilience.breaker.current).toBe("open");
  });

  it("lets only one probe through while half open", async () => {
    const { resilience, advance } = setup();
    for (let i = 0; i < 3; i += 1)
      await resilience.call("s", down, { timeoutMs: 100 }).catch(() => {});
    advance(10_001);
    let release: (v: string) => void = () => {};
    const probe = resilience.call("s", () => new Promise<string>((r) => (release = r)), {
      timeoutMs: 1000,
    });
    await expect(
      resilience.call("s", async () => "second", { timeoutMs: 100 }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    release("first");
    await expect(probe).resolves.toBe("first");
  });

  it("a success resets the failure count", async () => {
    const { resilience } = setup();
    for (let i = 0; i < 2; i += 1)
      await resilience.call("s", down, { timeoutMs: 100 }).catch(() => {});
    await resilience.call("s", async () => "ok", { timeoutMs: 100 });
    for (let i = 0; i < 2; i += 1)
      await resilience.call("s", down, { timeoutMs: 100 }).catch(() => {});
    expect(resilience.breaker.current).toBe("closed");
  });
});

describe("fallback", () => {
  it("returns the defined fallback when the provider is down", async () => {
    const { resilience, events } = setup();
    const result = await resilience.call("scan", down, {
      timeoutMs: 100,
      fallback: () => ({ status: "error" as const }),
    });
    expect(result).toEqual({ status: "error" });
    expect(events).toContain("fallback");
  });

  it("uses the fallback while the circuit is open", async () => {
    const { resilience } = setup();
    for (let i = 0; i < 3; i += 1)
      await resilience.call("s", down, { timeoutMs: 100 }).catch(() => {});
    await expect(
      resilience.call("s", async () => "x", { timeoutMs: 100, fallback: () => "safe" }),
    ).resolves.toBe("safe");
  });
});

describe("protect() on real fakes", () => {
  it("wraps async methods, passes sync methods through, and survives an outage then recovery", async () => {
    const payments = new FakePaymentProvider();
    const metrics: MetricEvent[] = [];
    const safe = protect(
      payments,
      {
        provider: "razorpay",
        metrics: (e) => metrics.push(e),
        breaker: { failureThreshold: 2, openMs: 50 },
      },
      {
        createOrder: { timeoutMs: 500 },
        fetchPayment: { timeoutMs: 500, idempotent: true, backoffMs: 1 },
      },
    );

    // Sync method untouched.
    const sig = payments.signWebhook("{}");
    expect(safe.verifyWebhook({ rawBody: "{}", signature: sig })).toBe(true);

    payments.failures.failNext(2);
    const order = { amountPaise: 100, currency: "INR" as const, receipt: "r" };
    await expect(safe.createOrder(order)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(safe.createOrder(order)).rejects.toMatchObject({ kind: "unavailable" });
    // Circuit is open: the next call is refused without reaching the fake.
    await expect(safe.createOrder(order)).rejects.toMatchObject({ kind: "unavailable" });
    expect(metrics).toContain("circuit_open");

    await new Promise((r) => setTimeout(r, 60));
    await expect(safe.createOrder(order)).resolves.toHaveProperty("orderId");
  });

  it("a scanner outage falls back to status error, which keeps the file inactive", async () => {
    const scanner = new FakeFileScanner();
    const safe = protect(
      scanner,
      { provider: "clamav" },
      {
        scan: { timeoutMs: 200, fallback: () => ({ status: "error" as const }) },
      },
    );
    scanner.failures.failNext(1);
    expect(await safe.scan({ storageKey: "files/x" })).toEqual({ status: "error" });
    expect(await safe.scan({ storageKey: "files/x" })).toEqual({ status: "clean" });
  });

  it("an SMS provider error burst does not retry sends", async () => {
    const sms = new FakeSmsProvider();
    const safe = protect(sms, { provider: "msg91" }, { sendTemplate: { timeoutMs: 200 } });
    sms.failures.failNext(1);
    await expect(
      safe.sendTemplate({ to: "+919812345678", templateKey: "otp", variables: {} }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(sms.sent).toHaveLength(0);
  });
});

describe("protect only wraps the methods it is told about", () => {
  it("leaves inherited names such as constructor and toString alone", () => {
    class Thing {
      async work() {
        return 1;
      }
    }
    const wrapped = protect(new Thing(), { provider: "t" }, { work: { timeoutMs: 100 } });
    expect(wrapped.constructor).toBe(Thing);
    expect(typeof wrapped.toString).toBe("function");
    expect(wrapped.toString()).toBe("[object Object]");
  });
});
