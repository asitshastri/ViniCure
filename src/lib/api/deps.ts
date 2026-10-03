import type { Actor, AuditSpec, RateLimitDecision, RateLimitInput } from "./types";

// The pieces withApi() needs from other modules. Each later task plugs its real
// implementation in through configureApi(): rate limiter (P1-08), idempotency
// (P1-16), audit (P1-17), session lookup (P2). Until then the defaults below
// fail closed in production, so a missing piece can never open a route.

export type Authenticator = (request: Request) => Promise<Actor | null>;
export type RateLimiter = (input: RateLimitInput) => Promise<RateLimitDecision>;
export type AuditWriter = (entry: {
  spec: AuditSpec;
  actorId: string | null;
  requestId: string;
  route: string;
  status: number;
}) => Promise<void>;
export type IdempotencyRunner = (args: {
  key: string;
  actorId: string | null;
  route: string;
  requestHash: string;
  execute: () => Promise<Response>;
}) => Promise<Response>;

export type ApiDeps = {
  authenticate?: Authenticator;
  rateLimit?: RateLimiter;
  audit?: AuditWriter;
  idempotency?: IdempotencyRunner;
  /** Overrides NODE_ENV === "production". Used by tests. */
  production?: boolean;
  /** How many proxies sit in front of the app (load balancer, CDN). Default 1. */
  trustedProxyHops?: number;
};

let current: ApiDeps = {};

export function configureApi(deps: ApiDeps): void {
  current = { ...current, ...deps };
}

export function resetApiConfig(): void {
  current = {};
}

export function getApiDeps(): ApiDeps {
  return current;
}

export function isProduction(): boolean {
  return current.production ?? process.env.NODE_ENV === "production";
}
