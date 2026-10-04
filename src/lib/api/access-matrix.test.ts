import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCESS_MATRIX, type MatrixEntry } from "./access-matrix";
import { configureApi, resetApiConfig } from "./deps";
import { clearRoutesForTest, listRoutes, type RouteEntry } from "./registry";
import { STAFF_ROLES, type Actor, type Role } from "./types";

// P2-08: the access-control matrix harness. Runs in CI with the rest of the tests.

const apiDir = path.resolve(import.meta.dirname, "../../app/api");
const ORIGIN = "https://vinicure.example";
const ROLES: Role[] = ["patient", "doctor", "admin", "super_admin", "support"];

function routeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Whether a role gets past the gate of this route, from the matrix alone. */
function expectedAllowed(entry: MatrixEntry, role: Role | "anonymous"): boolean {
  if (entry.auth === "public") return true;
  if (role === "anonymous") return false;
  if (entry.auth === "staff" && !STAFF_ROLES.includes(role)) return false;
  if (entry.roles.length > 0 && !entry.roles.includes(role)) return false;
  return true;
}

const key = (r: RouteEntry) => `${r.method} ${r.path}`;
let routes: RouteEntry[] = [];
const handlers = new Map<string, (request: Request, context?: unknown) => Promise<Response>>();

beforeAll(async () => {
  clearRoutesForTest();
  for (const file of routeFiles(apiDir)) {
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    // Routes live in the next app dir; the exported names are the HTTP methods.
    const found = listRoutes();
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const handler = mod[method];
      if (typeof handler !== "function") continue;
      const owner = found.find(
        (r) =>
          r.method === method &&
          !handlers.has(`${method} ${r.path}`) &&
          file.includes(pathHint(r.path)),
      );
      if (owner) handlers.set(key(owner), handler as never);
    }
  }
  routes = listRoutes();
}, 60_000);

afterAll(() => resetApiConfig());

/** The folder part of a route path that appears in its file path, to pair handlers with routes. */
function pathHint(routePath: string): string {
  return routePath
    .replace(/^\/api\//, "")
    .replace(/\/\*$/, "")
    .split("/")
    .map((part) => (part.startsWith(":") ? `[${part.slice(1)}]` : part))
    .join(path.sep);
}

describe("the matrix covers exactly the routes that exist", () => {
  it("has at least one route", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it("every route is listed in the matrix", () => {
    const missing = routes.map(key).filter((k) => !(k in ACCESS_MATRIX));
    expect(
      missing,
      `add these routes to src/lib/api/access-matrix.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every matrix entry is a route that exists", () => {
    const existing = new Set(routes.map(key));
    const stale = Object.keys(ACCESS_MATRIX).filter((k) => !existing.has(k));
    expect(stale, `remove from the matrix: ${stale.join(", ")}`).toEqual([]);
  });

  it("every route is paired with its handler for the behaviour checks", () => {
    const unpaired = routes.map(key).filter((k) => !handlers.has(k));
    expect(unpaired).toEqual([]);
  });

  it("route settings match the matrix", () => {
    for (const route of routes) {
      const want = ACCESS_MATRIX[key(route) as keyof typeof ACCESS_MATRIX];
      if (!want) continue;
      expect(
        {
          auth: route.auth,
          roles: [...route.roles].sort(),
          roleDenied: route.roleDenied,
          rateLimit: route.rateLimit,
          audited: route.audited,
        },
        key(route),
      ).toEqual({
        auth: want.auth,
        roles: [...want.roles].sort(),
        roleDenied: want.roleDenied,
        rateLimit: want.rateLimit,
        audited: want.audited,
      });
    }
  });

  it("every route behind a login has a rate limit, and every mutating route is rate limited", () => {
    for (const route of routes) expect(route.rateLimit, key(route)).toBeTruthy();
  });

  it("no public route lists roles, and no staff route is open to patients", () => {
    for (const entry of Object.entries(ACCESS_MATRIX)) {
      const [name, e] = entry;
      if (e.auth === "public") expect(e.roles, name).toEqual([]);
      if (e.auth === "staff") expect(e.roles, name).not.toContain("patient");
      expect(e.why.length, `${name} needs a reason`).toBeGreaterThan(10);
    }
  });
});

describe("the running routes enforce the matrix", () => {
  let current: { actor: Actor | null } = { actor: null };
  beforeAll(() => {
    configureApi({
      production: false,
      trustedOrigins: [ORIGIN],
      authenticate: async () => current.actor,
      rateLimit: async () => ({ allowed: true, limit: 100, remaining: 99, retryAfterSeconds: 0 }),
      audit: async () => undefined,
    });
  });

  const actorFor = (role: Role): Actor => ({
    userId: `user-${role}`,
    roles: [role],
    sessionId: "s",
  });
  const call = (route: RouteEntry, init: { origin?: string } = {}) => {
    const url = `${ORIGIN}${route.path.replace(/:\w+/g, "x".repeat(32)).replace("/*", "/probe")}`;
    const handler = handlers.get(key(route));
    if (!handler) throw new Error(`no handler for ${key(route)}`);
    return handler(
      new Request(url, {
        method: route.method,
        headers: {
          "content-type": "application/json",
          origin: init.origin ?? ORIGIN,
        },
        body: route.method === "GET" ? undefined : "{}",
      }),
      { params: Promise.resolve({ token: "x".repeat(32) }) },
    );
  };

  it("a request with no session is refused with 401 on every protected route", async () => {
    current = { actor: null };
    for (const route of routes) {
      const entry = ACCESS_MATRIX[key(route) as keyof typeof ACCESS_MATRIX];
      if (!entry || entry.auth === "public") continue;
      expect((await call(route)).status, key(route)).toBe(401);
    }
  });

  it("each role is kept out or let through as the matrix says", async () => {
    for (const route of routes) {
      const entry = ACCESS_MATRIX[key(route) as keyof typeof ACCESS_MATRIX];
      if (!entry || entry.auth === "public") continue;
      for (const role of ROLES) {
        current = { actor: actorFor(role) };
        const status = (await call(route)).status;
        const label = `${key(route)} as ${role}`;
        if (expectedAllowed(entry, role)) {
          if (entry.probeAllowed)
            expect(status, label).toBe(422); // past the gate, stopped by validation
          else expect([401, 403, 404], label).not.toContain(status);
        } else {
          expect(status, label).toBe(entry.roleDenied === "not_found" ? 404 : 403);
        }
      }
    }
  });

  it("a state-changing request from another site is refused on every route", async () => {
    current = { actor: actorFor("admin") };
    for (const route of routes.filter((r) => r.method !== "GET")) {
      expect((await call(route, { origin: "https://evil.example" })).status, key(route)).toBe(403);
    }
  });
});
