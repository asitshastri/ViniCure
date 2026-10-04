import type { Role } from "../../lib/api/types";

// Server-side guard for pages behind sign-in (TODO F-04). The route guard in the layouts is the
// first lock; the API enforces access again on every call. Pure decision here, so it is tested
// without Next.js; requireRole() in page-guard-next.ts applies it.

export type GuardOutcome = "allow" | "login" | "not_found";

/**
 * - no session: send to sign-in
 * - a session with none of the allowed roles: 404, so the page's existence is not shown
 * - `mock` (development preview only): let everyone in
 */
export function guardOutcome(
  actorRoles: readonly Role[] | null,
  allowed: readonly Role[],
  mock = false,
): GuardOutcome {
  if (mock) return "allow";
  if (!actorRoles) return "login";
  return actorRoles.some((role) => allowed.includes(role)) ? "allow" : "not_found";
}
