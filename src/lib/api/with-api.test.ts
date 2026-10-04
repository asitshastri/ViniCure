import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { configureApi, resetApiConfig } from "./deps";
import { clearRoutesForTest, listRoutes } from "./registry";
import type { Actor } from "./types";
import { clientIp, withApi } from "./with-api";

const patient: Actor = { userId: "u-patient", roles: ["patient"], sessionId: "s-1" };
const admin: Actor = { userId: "u-admin", roles: ["admin"], sessionId: "s-2" };

let nextActor: Actor | null = null;

beforeEach(() => {
  clearRoutesForTest();
  resetApiConfig();
  nextActor = null;
  configureApi({ production: false, authenticate: async () => nextActor });
});
afterEach(() => resetApiConfig());

function post(body: unknown, headers: Record<string, string> = {}, url = "http://x.test/api/v1/t") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = (url = "http://x.test/api/v1/t", headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe("request id and basic flow", () => {
  it("adds X-Request-Id and no-store, and serialises plain data", async () => {
    const handler = withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "public_read" },
      () => ({
        ok: true,
      }),
    );
    const res = await handler(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps a safe incoming request id and replaces an unsafe one", async () => {
    const handler = withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "public_read" },
      () => null,
    );
    expect(
      (
        await handler(get("http://x.test/api/v1/t", { "x-request-id": "abcd-1234-efgh" }))
      ).headers.get("X-Request-Id"),
    ).toBe("abcd-1234-efgh");
    const bad = await handler(get("http://x.test/api/v1/t", { "x-request-id": "x y" }));
    expect(bad.status).toBe(204);
    expect(bad.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns problem-details for thrown errors and hides unknown error text", async () => {
    const handler = withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "public_read" },
      () => {
        throw new Error("secret db host");
      },
    );
    const res = await handler(get());
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("secret db host");
    expect(JSON.parse(text).requestId).toBe(res.headers.get("X-Request-Id"));
  });
});

describe("authentication and roles", () => {
  const config = {
    method: "GET",
    path: "/api/v1/me",
    auth: "session",
    rateLimit: "auth_read",
  } as const;

  it("returns 401 without a session and never runs the handler", async () => {
    const spy = vi.fn(() => ({}));
    const res = await withApi(config, spy)(get());
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed when no authenticator is configured", async () => {
    resetApiConfig();
    configureApi({ production: false });
    expect((await withApi(config, () => ({}))(get())).status).toBe(401);
  });

  it("passes the actor to the handler", async () => {
    nextActor = patient;
    const res = await withApi(config, ({ actor }) => ({ id: actor.userId }))(get());
    expect(await res.json()).toEqual({ id: "u-patient" });
  });

  it("denies the wrong role with 403, or 404 when roleDenied is not_found", async () => {
    nextActor = patient;
    const a = await withApi({ ...config, path: "/api/v1/a", roles: ["doctor"] }, () => ({}))(get());
    expect(a.status).toBe(403);
    const b = await withApi(
      { ...config, path: "/api/v1/b", roles: ["admin"], roleDenied: "not_found" },
      () => ({}),
    )(get());
    expect(b.status).toBe(404);
  });

  it("staff mode rejects a patient and accepts an admin", async () => {
    const staff = withApi({ ...config, path: "/api/v1/s", auth: "staff" }, () => ({ ok: 1 }));
    nextActor = patient;
    expect((await staff(get())).status).toBe(403);
    nextActor = admin;
    expect((await staff(get())).status).toBe(200);
  });

  it("rejects a route registered public with roles", () => {
    expect(() =>
      withApi(
        {
          method: "GET",
          path: "/api/v1/p",
          auth: "public",
          roles: ["patient"],
          rateLimit: "public_read",
        },
        () => ({}),
      ),
    ).toThrow();
  });
});

describe("validation", () => {
  const Body = z.strictObject({ note: z.string().min(1) });
  const build = () =>
    withApi(
      { method: "POST", path: "/api/v1/t", auth: "public", rateLimit: "write", body: Body },
      ({ body }) => ({
        echo: body.note,
      }),
    );

  it("accepts a valid body", async () => {
    const res = await build()(post({ note: "hi" }));
    expect(await res.json()).toEqual({ echo: "hi" });
  });

  it("rejects unknown fields and wrong types with 422 and no echo of values", async () => {
    const res = await build()(post({ note: 5, role: "admin-secret" }));
    const text = await res.text();
    expect(res.status).toBe(422);
    expect(text).not.toContain("admin-secret");
  });

  it("rejects bad JSON, wrong content type and oversized bodies", async () => {
    expect((await build()(post("{nope"))).status).toBe(400);
    const wrongType = new Request("http://x.test/api/v1/t", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x",
    });
    expect((await build()(wrongType)).status).toBe(400);
    const big = withApi(
      {
        method: "POST",
        path: "/api/v1/big",
        auth: "public",
        rateLimit: "write",
        body: z.object({ a: z.string() }),
        maxBodyBytes: 20,
      },
      () => ({}),
    );
    expect((await big(post({ a: "x".repeat(100) }))).status).toBe(413);
  });

  it("validates query and params from the allow-list schema", async () => {
    const handler = withApi(
      {
        method: "GET",
        path: "/api/v1/things/:id",
        auth: "public",
        rateLimit: "public_read",
        query: z.strictObject({ limit: z.coerce.number().int().max(100).default(20) }),
        params: z.strictObject({ id: z.uuid() }),
      },
      ({ query, params }) => ({ limit: query.limit, id: params.id }),
    );
    const id = "3f2b8c1e-9d4a-4c3b-8e1f-2a5b6c7d8e9f";
    const ok = await handler(get("http://x.test/api/v1/things/x?limit=5"), {
      params: Promise.resolve({ id }),
    });
    expect(await ok.json()).toEqual({ limit: 5, id });
    expect(
      (await handler(get("http://x.test/a?limit=500"), { params: Promise.resolve({ id }) })).status,
    ).toBe(422);
    expect(
      (await handler(get("http://x.test/a?sort=drop"), { params: Promise.resolve({ id }) })).status,
    ).toBe(422);
    expect(
      (await handler(get("http://x.test/a"), { params: Promise.resolve({ id: "1" }) })).status,
    ).toBe(422);
    expect(
      (await handler(get("http://x.test/a?limit=1&limit=2"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(422);
  });
});

describe("rate limiting", () => {
  const allow = { allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 };

  it("returns 429 with Retry-After and does not run the handler", async () => {
    configureApi({
      rateLimit: async () => ({ allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 30 }),
    });
    const spy = vi.fn(() => ({}));
    const res = await withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "public_read" },
      spy,
    )(get());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("RateLimit-Limit")).toBe("10");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sensitive tiers fail closed in production when the cache is down", async () => {
    configureApi({
      production: true,
      rateLimit: async () => {
        throw new Error("valkey down");
      },
    });
    const res = await withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "otp_send" },
      () => ({}),
    )(get());
    expect(res.status).toBe(503);
  });

  it("public read tiers fail open when the cache is down", async () => {
    configureApi({
      production: true,
      rateLimit: async () => {
        throw new Error("valkey down");
      },
    });
    const res = await withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "public_read" },
      () => ({ ok: 1 }),
    )(get());
    expect(res.status).toBe(200);
  });

  it("production refuses to serve when no limiter is configured", async () => {
    configureApi({ production: true });
    const res = await withApi(
      { method: "GET", path: "/api/v1/t", auth: "public", rateLimit: "public_read" },
      () => ({}),
    )(get());
    expect(res.status).toBe(503);
  });

  it("checks per user after authentication and passes the address", async () => {
    nextActor = patient;
    const calls: unknown[] = [];
    configureApi({
      rateLimit: async (i) => {
        calls.push(i);
        return allow;
      },
    });
    await withApi(
      { method: "GET", path: "/api/v1/t", auth: "session", rateLimit: "auth_read" },
      () => ({}),
    )(get("http://x.test/api/v1/t", { "x-forwarded-for": "1.1.1.1, 9.9.9.9" }));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ ip: "9.9.9.9", userId: undefined });
    expect(calls[1]).toMatchObject({ ip: "9.9.9.9", userId: "u-patient" });
  });

  it("clientIp ignores a forged left side", () => {
    expect(clientIp(get("http://x/", { "x-forwarded-for": "6.6.6.6, 7.7.7.7, 9.9.9.9" }), 1)).toBe(
      "9.9.9.9",
    );
    expect(clientIp(get("http://x/"), 1)).toBe("unknown");
  });
});

describe("idempotency and audit", () => {
  const cfg = {
    method: "POST",
    path: "/api/v1/pay",
    auth: "public",
    rateLimit: "payments",
    idempotent: true,
    body: z.object({ a: z.number() }),
  } as const;

  it("requires a valid Idempotency-Key", async () => {
    configureApi({ idempotency: async ({ execute }) => execute() });
    expect((await withApi(cfg, () => ({}))(post({ a: 1 }))).status).toBe(400);
    expect(
      (await withApi(cfg, () => ({}))(post({ a: 1 }, { "idempotency-key": "bad key!" }))).status,
    ).toBe(400);
  });

  it("fails closed when idempotency is not configured", async () => {
    expect(
      (await withApi(cfg, () => ({}))(post({ a: 1 }, { "idempotency-key": "key-12345678" })))
        .status,
    ).toBe(503);
  });

  it("passes a stable hash of the request to the store", async () => {
    const hashes: string[] = [];
    configureApi({
      idempotency: async ({ requestHash, execute }) => {
        hashes.push(requestHash);
        return execute();
      },
    });
    const h = withApi(cfg, () => ({}));
    await h(post({ a: 1 }, { "idempotency-key": "key-12345678" }));
    await h(post({ a: 1 }, { "idempotency-key": "key-12345678" }));
    await h(post({ a: 2 }, { "idempotency-key": "key-12345678" }));
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[2]).not.toBe(hashes[0]);
  });

  it("writes an audit entry only after success", async () => {
    nextActor = patient;
    const entries: unknown[] = [];
    configureApi({
      audit: async (e) => {
        entries.push(e);
      },
    });
    const audit = { action: "appointment.hold", entity: "appointment" };
    const base = {
      method: "POST",
      path: "/api/v1/a",
      auth: "session",
      rateLimit: "write",
      audit,
    } as const;
    await withApi(base, () => ({}))(post({}));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: "u-patient", spec: audit, status: 200 });
    await withApi({ ...base, path: "/api/v1/b" }, () => {
      throw new Error("x");
    })(post({}));
    expect(entries).toHaveLength(1);
  });

  it("production refuses an audited route when no audit writer exists", async () => {
    nextActor = patient;
    configureApi({
      production: true,
      trustedOrigins: ["http://x.test"],
      rateLimit: async () => ({ allowed: true, limit: 1, remaining: 1, retryAfterSeconds: 0 }),
    });
    const res = await withApi(
      {
        method: "POST",
        path: "/api/v1/a",
        auth: "session",
        rateLimit: "write",
        audit: { action: "x", entity: "y" },
      },
      () => ({}),
    )(post({}));
    expect(res.status).toBe(500);
  });
});

describe("method check and registry", () => {
  it("rejects a request whose method does not match", async () => {
    const res = await withApi(
      { method: "POST", path: "/api/v1/t", auth: "public", rateLimit: "write" },
      () => ({}),
    )(get());
    expect(res.status).toBe(405);
  });

  it("registers every route and refuses conflicting duplicates", () => {
    withApi(
      {
        method: "GET",
        path: "/api/v1/x",
        auth: "session",
        roles: ["patient"],
        rateLimit: "auth_read",
      },
      () => ({}),
    );
    expect(listRoutes()).toEqual([
      expect.objectContaining({
        method: "GET",
        path: "/api/v1/x",
        auth: "session",
        roles: ["patient"],
        rateLimit: "auth_read",
      }),
    ]);
    expect(() =>
      withApi(
        { method: "GET", path: "/api/v1/x", auth: "public", rateLimit: "public_read" },
        () => ({}),
      ),
    ).toThrow(/twice/);
  });
});

// CI guard: every API route file must build its handlers with withApi().
describe("route files", () => {
  const apiDir = path.resolve(import.meta.dirname, "../../app/api");

  function routeFiles(dir: string): string[] {
    try {
      return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return routeFiles(full);
        return /^route\.(ts|tsx|js)$/.test(name) ? [full] : [];
      });
    } catch {
      return [];
    }
  }

  it("all use withApi for every exported HTTP method", () => {
    const methods =
      /export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    for (const file of routeFiles(apiDir)) {
      const source = readFileSync(file, "utf8");
      const exported = [...source.matchAll(methods)].map((m) => m[1]);
      for (const method of exported) {
        const wrapped = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withApi\\(`);
        expect(
          wrapped.test(source),
          `${path.relative(apiDir, file)} ${method} must use withApi()`,
        ).toBe(true);
      }
    }
  });
});

describe("origin check on state-changing requests", () => {
  const route = () =>
    withApi({ method: "POST", path: "/api/v1/o", auth: "public", rateLimit: "write" }, () => ({
      ok: true,
    }));
  const allow = async () => ({ allowed: true, limit: 1, remaining: 1, retryAfterSeconds: 0 });

  it("refuses a foreign Origin, allows our own, and allows a caller with no Origin", async () => {
    configureApi({
      production: true,
      trustedOrigins: ["https://vinicure.example"],
      rateLimit: allow,
    });
    const handler = route();
    expect((await handler(post({}, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await handler(post({}, { origin: "https://vinicure.example" }))).status).toBe(200);
    expect((await handler(post({}))).status).toBe(200);
  });

  it("refuses a browser that says it is cross-site but sends no Origin", async () => {
    configureApi({
      production: true,
      trustedOrigins: ["https://vinicure.example"],
      rateLimit: allow,
    });
    const res = await route()(post({}, { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
  });

  it("does not look at GET requests", async () => {
    configureApi({
      production: true,
      trustedOrigins: ["https://vinicure.example"],
      rateLimit: allow,
    });
    const handler = withApi(
      { method: "GET", path: "/api/v1/g", auth: "public", rateLimit: "public_read" },
      () => ({ ok: true }),
    );
    expect(
      (await handler(get("http://x.test/api/v1/g", { origin: "https://evil.example" }))).status,
    ).toBe(200);
  });

  it("production without trusted origins refuses to serve a state-changing request", async () => {
    configureApi({ production: true, rateLimit: allow });
    expect((await route()(post({}))).status).toBe(503);
  });
});
