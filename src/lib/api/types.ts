import type { Logger } from "pino";
import type { z } from "zod";

export type Role = "patient" | "doctor" | "admin" | "super_admin" | "support";
export const STAFF_ROLES: readonly Role[] = ["doctor", "admin", "super_admin", "support"];

/** public: nobody signed in needed. session: any signed-in user. staff: doctor, admin, super_admin or support. */
export type AuthMode = "public" | "session" | "staff";

export type Actor = {
  userId: string;
  roles: readonly Role[];
  sessionId: string;
  /** The name on the account, for greeting the person. Never used for decisions. */
  displayName?: string;
  /**
   * True for a session that has not proven a second method after a risky phone sign-in
   * (D-019). It can sign out and unlock itself, and nothing more.
   */
  limited?: boolean;
  /** When the person last signed in. Sensitive actions require this to be recent. */
  lastSignInAt?: Date;
};

export const RATE_LIMIT_TIERS = [
  "public_read",
  "auth_read",
  "write",
  "otp_send",
  "otp_verify",
  "sign_in",
  "password_reset",
  "payments",
  "webhook",
  "ai",
  "admin",
] as const;
export type RateLimitTier = (typeof RATE_LIMIT_TIERS)[number];

/** Tiers that must deny when the cache is down (CLAUDE.md, decision D-006). */
export const FAIL_CLOSED_TIERS: ReadonlySet<RateLimitTier> = new Set([
  "otp_send",
  "otp_verify",
  "sign_in",
  "password_reset",
  "payments",
  "admin",
]);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type AuditSpec = { action: string; entity: string };

export type RouteConfig<
  Body extends z.ZodType | undefined,
  Query extends z.ZodType | undefined,
  Params extends z.ZodType | undefined,
  A extends AuthMode = AuthMode,
> = {
  method: HttpMethod;
  /** Public path with :params, as in the API catalogue, for example "/api/v1/patients/:id". */
  path: string;
  auth: A;
  /** Checked after authentication. Empty or missing means any role allowed by `auth`. */
  roles?: readonly Role[];
  /** What a caller with the wrong role sees. Admin routes use "not_found" so they stay hidden. */
  roleDenied?: "forbidden" | "not_found";
  rateLimit: RateLimitTier;
  /** Needs a sign-in within the last 15 minutes (sensitive actions). Older sessions get 403. */
  freshLogin?: boolean;
  /**
   * Refuses a limited session (403 step_up_required). Set it on every route that reads or
   * changes what is stored about the patient.
   */
  fullSession?: boolean;
  body?: Body;
  query?: Query;
  params?: Params;
  /** Requires an Idempotency-Key header and replays the stored response. */
  idempotent?: boolean;
  audit?: AuditSpec;
  /** Largest accepted request body in bytes. Default 65536. */
  maxBodyBytes?: number;
  /** Text for the OpenAPI document. A route without a summary fails the CI check. */
  doc?: RouteDoc;
};

export type RouteDoc = {
  summary: string;
  tags?: string[];
  /** Shape of the 200 response, for the document only. */
  response?: z.ZodType;
};

export type Parsed<S extends z.ZodType | undefined> = S extends z.ZodType ? z.output<S> : undefined;

export type HandlerContext<Body, Query, Params, A extends AuthMode> = {
  request: Request;
  requestId: string;
  logger: Logger;
  actor: A extends "public" ? Actor | null : Actor;
  body: Body;
  query: Query;
  params: Params;
};

/** A handler returns plain data (sent as JSON with status 200), null (204) or a ready Response. */
export type HandlerResult = Response | object | null;

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitInput = { tier: RateLimitTier; route: string; ip: string; userId?: string };
