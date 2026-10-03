import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { configureApi, resetApiConfig } from "../api/deps";
import { clearRoutesForTest } from "../api/registry";
import type { Actor } from "../api/types";
import { withApi } from "../api/with-api";
import { MemoryCache } from "../cache/cache";
import { Crypto, LocalKeyProvider } from "../crypto/crypto";
import { MemoryDurableStore, createIdempotency, scopeHashOf } from "./idempotency";

let now = 1_000_000;
const patient: Actor = { userId: "u1", roles: ["patient"], sessionId: "s1" };
let actor: Actor | null = patient;

function newRunner() {
  const cache = new MemoryCache(() => now);
  const store = new MemoryDurableStore(() => now);
  const crypto = new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars"));
  const runner = createIdempotency({ cache, store, crypto, env: "test", now: () => now });
  return { cache, store, runner };
}

function setup() {
  const { cache, store, runner } = newRunner();
  clearRoutesForTest();
  resetApiConfig();
  configureApi({ production: false, authenticate: async () => actor, idempotency: runner });
  let executed = 0;
  const route = withApi(
    {
      method: "POST",
      path: "/api/v1/appointments/hold",
      auth: "session",
      rateLimit: "write",
      idempotent: true,
      body: z.strictObject({ slot: z.string() }),
    },
    ({ body }) => {
      executed += 1;
      return { bookingId: `b-${executed}`, slot: body.slot };
    },
  );
  const call = (body: unknown, key = "key-12345678") =>
    route(
      new Request("http://x.test/api/v1/appointments/hold", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(body),
      }),
    );
  return { call, store, cache, executed: () => executed, runner };
}

beforeEach(() => {
  now = 1_000_000;
  actor = patient;
});

describe("replay", () => {
  it("returns the same response for the same key and request, running the handler once", async () => {
    const { call, executed } = setup();
    const first = await call({ slot: "s1" });
    const second = await call({ slot: "s1" });
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ bookingId: "b-1", slot: "s1" });
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(first.headers.get("Idempotent-Replayed")).toBeNull();
    expect(executed()).toBe(1);
  });

  it("a changed request under the same key returns 422", async () => {
    const { call, executed } = setup();
    await call({ slot: "s1" });
    const changed = await call({ slot: "s2" });
    expect(changed.status).toBe(422);
    expect((await changed.json()).code).toBe("idempotency_conflict");
    expect(executed()).toBe(1);
  });

  it("scopes keys to the caller, so another user cannot replay or collide", async () => {
    const { call, executed } = setup();
    await call({ slot: "s1" });
    actor = { userId: "u2", roles: ["patient"], sessionId: "s2" };
    const other = await call({ slot: "s1" });
    expect(await other.json()).toEqual({ bookingId: "b-2", slot: "s1" });
    expect(executed()).toBe(2);
  });

  it("expires after 24 hours", async () => {
    const { call, executed } = setup();
    await call({ slot: "s1" });
    now += 24 * 60 * 60 * 1000 + 1;
    await call({ slot: "s1" });
    expect(executed()).toBe(2);
  });
});

describe("concurrency", () => {
  it("of ten identical simultaneous requests exactly one runs; the rest wait or replay", async () => {
    const { call, executed } = setup();
    const results = await Promise.all(Array.from({ length: 10 }, () => call({ slot: "s1" })));
    expect(executed()).toBe(1);
    for (const result of results) expect([200, 409]).toContain(result.status);
    const retry = await call({ slot: "s1" });
    expect(retry.status).toBe(200);
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(executed()).toBe(1);
  });
});

describe("failures", () => {
  it("a server error frees the key so the retry runs, and the success is then stored", async () => {
    const { runner } = newRunner();
    let attempts = 0;
    const execute = async () => {
      attempts += 1;
      if (attempts === 1) return new Response("{}", { status: 503 });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const args = { key: "key-12345678", actorId: "u1", route: "/r", requestHash: "h", execute };
    expect((await runner(args)).status).toBe(503);
    expect((await runner(args)).status).toBe(200);
    expect(attempts).toBe(2);
    expect((await runner(args)).headers.get("Idempotent-Replayed")).toBe("true");
  });

  it("a thrown error frees the key", async () => {
    const { runner } = newRunner();
    let attempts = 0;
    const args = {
      key: "key-12345678",
      actorId: "u1",
      route: "/r",
      requestHash: "h",
      execute: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        return new Response("{}", { status: 200 });
      },
    };
    await expect(runner(args)).rejects.toThrow("boom");
    expect((await runner(args)).status).toBe(200);
  });

  it("a client error response is stored and replayed too", async () => {
    const { runner } = newRunner();
    let attempts = 0;
    const args = {
      key: "key-12345678",
      actorId: "u1",
      route: "/r",
      requestHash: "h",
      execute: async () => {
        attempts += 1;
        return new Response('{"code":"slot_taken"}', {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      },
    };
    await runner(args);
    const again = await runner(args);
    expect(again.status).toBe(409);
    expect(attempts).toBe(1);
  });
});

describe("storage", () => {
  it("stores only a hash of the key and the response body encrypted", async () => {
    const { call, store, cache } = setup();
    await call({ slot: "secret-slot" }, "my-private-key-123");
    const [record] = [...store.records.values()];
    expect(record?.scopeHash).toBe(
      scopeHashOf("u1", "/api/v1/appointments/hold", "my-private-key-123"),
    );
    expect(JSON.stringify([...store.records.entries()])).not.toContain("my-private-key-123");
    expect(record?.responseBodyEnc?.startsWith("v1:")).toBe(true);
    expect(record?.responseBodyEnc).not.toContain("secret-slot");
    // The cache holds only the request hash, never a response body.
    const cached = await cache.get(`vc:test:idem:${record?.scopeHash}`);
    expect(cached).toHaveLength(64);
  });

  it("does not replay a body it cannot decrypt", async () => {
    const { call, store } = setup();
    await call({ slot: "s1" });
    const [record] = [...store.records.values()];
    if (record) record.responseBodyEnc = "v1:local-1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA";
    const second = await call({ slot: "s1" });
    expect(second.status).toBe(409);
  });
});
