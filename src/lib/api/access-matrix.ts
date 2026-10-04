import type { AuthMode, HttpMethod, RateLimitTier, Role } from "./types";

// The access-control matrix (P2-08): who may call each route, written by hand and kept apart
// from the route files on purpose. The matrix test (access-matrix.test.ts) loads every route
// and fails when
//   - a route exists that is not listed here (add it, and decide who may call it),
//   - a route listed here no longer exists,
//   - a route's settings differ from what is written here, or
//   - the running route lets a role in or keeps one out contrary to this table.
// Adding a route therefore always includes a deliberate line in this file.

export type MatrixEntry = {
  auth: AuthMode;
  /** Roles allowed after authentication. Empty means any role the `auth` mode admits. */
  roles: readonly Role[];
  /** What a signed-in caller with the wrong role sees. */
  roleDenied: "forbidden" | "not_found";
  rateLimit: RateLimitTier;
  audited: boolean;
  /** True when the route needs a sign-in within the last 15 minutes. */
  freshLogin: boolean;
  /**
   * For routes behind a login: true when a request with an empty body reaches the validator
   * (422), which proves the caller got past the gate without running the handler. Routes
   * without a body schema set false and are only checked for the denied cases.
   */
  probeAllowed: boolean;
  why: string;
};

export type RouteKey = `${HttpMethod} ${string}`;

export const ACCESS_MATRIX: Record<RouteKey, MatrixEntry> = {
  "GET /api/health": {
    auth: "public",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "public_read",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "Liveness probe for the load balancer. Writes nothing, shows nothing private.",
  },
  "GET /api/ready": {
    auth: "public",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "public_read",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "Readiness probe: database and cache ping, no details to the caller.",
  },
  "GET /api/auth/*": {
    auth: "public",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "public_read",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "Better Auth read endpoints (session lookup and similar). Each one checks its own cookie.",
  },
  "POST /api/auth/*": {
    auth: "public",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "write",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "Sign-in and sign-out. OTP send and verify also pass the OTP guard (limits, captcha, budget).",
  },
  "POST /api/v1/admin/invitations": {
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    audited: true,
    freshLogin: true,
    probeAllowed: true,
    why: "Admin invites a staff member. Hidden (404) from every other role.",
  },
  "POST /api/v1/invitations/:token/enrol": {
    auth: "public",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "otp_verify",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "The invitation link is the credential. Fails closed if the cache is down.",
  },
  "POST /api/v1/invitations/:token/accept": {
    auth: "public",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "otp_verify",
    audited: true,
    freshLogin: false,
    probeAllowed: false,
    why: "The invitation link is the credential, plus a first authenticator code.",
  },
  "GET /api/v1/patients": {
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "A patient lists the profiles on their own account. Other roles see 404.",
  },
  "POST /api/v1/patients": {
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "write",
    audited: true,
    freshLogin: false,
    probeAllowed: true,
    why: "A patient adds a profile to their own account (capped at 10).",
  },
  "GET /api/v1/patients/:id": {
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    audited: false,
    freshLogin: false,
    probeAllowed: true,
    why: "Owner only: another account's profile is 404, same as a missing one.",
  },
  "PATCH /api/v1/patients/:id": {
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "write",
    audited: true,
    freshLogin: false,
    probeAllowed: true,
    why: "Owner only. The minor flag is computed on the server, never sent.",
  },
  "DELETE /api/v1/patients/:id": {
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "write",
    audited: true,
    freshLogin: false,
    probeAllowed: true,
    why: "Owner only soft delete of a family member's profile.",
  },
  "GET /api/v1/sessions": {
    auth: "session",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "auth_read",
    audited: false,
    freshLogin: false,
    probeAllowed: false,
    why: "Any signed-in person lists their own sessions (the user id is in the query).",
  },
  "DELETE /api/v1/sessions": {
    auth: "session",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "write",
    audited: true,
    freshLogin: false,
    probeAllowed: false,
    why: "Sign out everywhere. Deliberately not fresh-login: it is the emergency exit.",
  },
  "DELETE /api/v1/sessions/:id": {
    auth: "session",
    roles: [],
    roleDenied: "forbidden",
    rateLimit: "write",
    audited: true,
    freshLogin: false,
    probeAllowed: true,
    why: "Ends one of the caller's own sessions; someone else's is 404.",
  },
};
