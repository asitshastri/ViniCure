import type { z } from "zod";
import type { AuthMode, HttpMethod, RateLimitTier, Role, RouteDoc } from "./types";

// Every route registers itself here when its module loads. The access-control
// matrix test (later) walks this list, so a route that is not registered cannot
// ship: a separate test fails if a route file does not use withApi().

export type RouteEntry = {
  method: HttpMethod;
  path: string;
  auth: AuthMode;
  roles: readonly Role[];
  roleDenied: "forbidden" | "not_found";
  rateLimit: RateLimitTier;
  freshLogin: boolean;
  idempotent: boolean;
  audited: boolean;
  hasBody: boolean;
  doc?: RouteDoc;
  schemas: { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
};

// Schemas are compared by identity, everything else by value. Hot reload creates new
// schema objects, so only the settings that matter for access are compared.
function accessSettings(entry: RouteEntry): string {
  return JSON.stringify({ ...entry, schemas: undefined, doc: undefined });
}

function sameRoute(a: RouteEntry, b: RouteEntry): boolean {
  return accessSettings(a) === accessSettings(b);
}

const routes = new Map<string, RouteEntry>();

export function registerRoute(entry: RouteEntry): void {
  const key = `${entry.method} ${entry.path}`;
  const existing = routes.get(key);
  // Hot reload re-registers the same route with the same settings. A different
  // route claiming the same key is a bug.
  if (existing && !sameRoute(existing, entry)) {
    throw new Error(`Route registered twice with different settings: ${key}`);
  }
  routes.set(key, entry);
}

export function listRoutes(): RouteEntry[] {
  return [...routes.values()].sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`),
  );
}

export function clearRoutesForTest(): void {
  routes.clear();
}
