import type { AuthMode, HttpMethod, RateLimitTier, Role } from "./types";

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
  idempotent: boolean;
  audited: boolean;
  hasBody: boolean;
};

const routes = new Map<string, RouteEntry>();

export function registerRoute(entry: RouteEntry): void {
  const key = `${entry.method} ${entry.path}`;
  const existing = routes.get(key);
  // Hot reload re-registers the same route with the same settings. A different
  // route claiming the same key is a bug.
  if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
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
