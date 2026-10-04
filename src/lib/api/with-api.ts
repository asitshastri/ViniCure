import { createHash } from "node:crypto";
import type { Logger } from "pino";
import type { z } from "zod";
import { isFreshLogin } from "../../modules/identity/session-policy";
import { AppError, errors } from "../errors/app-error";
import { problemResponse, zodToIssues } from "../errors/problem";
import { logger as rootLogger, newRequestId, requestLogger } from "../logging/logger";
import { getApiDeps, isProduction } from "./deps";
import { registerRoute } from "./registry";
import {
  FAIL_CLOSED_TIERS,
  STAFF_ROLES,
  type Actor,
  type AuthMode,
  type HandlerContext,
  type HandlerResult,
  type Parsed,
  type RouteConfig,
} from "./types";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

type RouteContext = { params?: Promise<Record<string, string | string[] | undefined>> };

/** The caller's address, taken from the right-hand side of X-Forwarded-For so a forged left side is ignored. */
export function clientIp(request: Request, hops = getApiDeps().trustedProxyHops ?? 1): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const parts = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[Math.max(0, parts.length - hops)] ?? "unknown";
}

async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new AppError("payload_too_large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("payload_too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw errors.validation(zodToIssues(result.error), { cause: result.error });
  return result.data;
}

function queryToObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return out;
}

function checkRoles(
  actor: Actor,
  config: { auth: AuthMode; roles?: readonly string[]; roleDenied?: string },
) {
  const denied = () => (config.roleDenied === "not_found" ? errors.notFound() : errors.forbidden());
  if (config.auth === "staff" && !actor.roles.some((role) => STAFF_ROLES.includes(role)))
    throw denied();
  if (
    config.roles &&
    config.roles.length > 0 &&
    !actor.roles.some((role) => config.roles?.includes(role))
  ) {
    throw denied();
  }
}

async function enforceRateLimit(
  config: { rateLimit: RouteConfig<undefined, undefined, undefined>["rateLimit"]; path: string },
  request: Request,
  userId: string | undefined,
  logger: Logger,
): Promise<void> {
  const { rateLimit } = getApiDeps();
  const production = isProduction();
  const failClosed = FAIL_CLOSED_TIERS.has(config.rateLimit);
  if (!rateLimit) {
    if (production) throw errors.unavailable({ cause: new Error("rate limiter not configured") });
    return;
  }
  let decision;
  try {
    decision = await rateLimit({
      tier: config.rateLimit,
      route: config.path,
      ip: clientIp(request),
      userId,
    });
  } catch (cause) {
    // Cache outage. Sensitive tiers deny; public reads continue and raise an alert.
    logger.error({
      event: "rate_limiter_unavailable",
      tier: config.rateLimit,
      failClosed,
      err: cause,
    });
    if (failClosed && production) throw errors.unavailable({ cause });
    return;
  }
  if (!decision.allowed) {
    logger.warn({ event: "rate_limited", tier: config.rateLimit, route: config.path });
    throw errors.rateLimited(decision.retryAfterSeconds, {
      headers: {
        "RateLimit-Limit": String(decision.limit),
        "RateLimit-Remaining": String(Math.max(0, decision.remaining)),
      },
    });
  }
}

/**
 * Origin check for state-changing requests, on top of SameSite cookies. A browser always sends
 * Origin on a cross-site POST, so a foreign Origin is refused. A request with no Origin (a
 * server calling us, such as a payment webhook) passes here and relies on its own signature;
 * a browser that says it is cross-site without Origin (Sec-Fetch-Site) is refused too.
 */
function enforceOrigin(request: Request, logger: Logger, path: string): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const { trustedOrigins } = getApiDeps();
  if (!trustedOrigins) {
    if (isProduction()) {
      throw errors.unavailable({ cause: new Error("trusted origins not configured") });
    }
    return;
  }
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const foreign = origin ? !trustedOrigins.includes(origin) : site === "cross-site";
  if (foreign) {
    logger.warn({ event: "origin_refused", route: path });
    throw errors.forbidden();
  }
}

function toResponse(result: HandlerResult | undefined): Response {
  if (result instanceof Response) return result;
  if (result === null || result === undefined) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function withStandardHeaders(response: Response, requestId: string): Response {
  try {
    response.headers.set("X-Request-Id", requestId);
    if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    // Headers of a fetched response are read-only: copy them.
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export function withApi<
  A extends AuthMode,
  Body extends z.ZodType | undefined = undefined,
  Query extends z.ZodType | undefined = undefined,
  Params extends z.ZodType | undefined = undefined,
>(
  config: RouteConfig<Body, Query, Params, A>,
  handler: (
    ctx: HandlerContext<Parsed<Body>, Parsed<Query>, Parsed<Params>, A>,
  ) => Promise<HandlerResult> | HandlerResult,
): (request: Request, context?: RouteContext) => Promise<Response> {
  const writes = config.method !== "GET";
  if (config.idempotent && !writes)
    throw new Error(`Idempotent route must not be GET: ${config.path}`);
  if (config.auth === "public" && config.roles && config.roles.length > 0) {
    throw new Error(`Public route cannot list roles: ${config.path}`);
  }

  registerRoute({
    method: config.method,
    path: config.path,
    auth: config.auth,
    roles: config.roles ?? [],
    roleDenied: config.roleDenied ?? "forbidden",
    rateLimit: config.rateLimit,
    freshLogin: config.freshLogin ?? false,
    idempotent: config.idempotent ?? false,
    audited: config.audit !== undefined,
    hasBody: config.body !== undefined,
    doc: config.doc,
    schemas: { body: config.body, query: config.query, params: config.params },
  });

  return async function route(request: Request, context?: RouteContext): Promise<Response> {
    const started = performance.now();
    const requestId = newRequestId(request.headers.get("x-request-id"));
    let logger = requestLogger({ requestId, route: config.path, method: config.method });
    let status = 500;
    let userId: string | undefined;

    try {
      if (request.method !== config.method) throw new AppError("method_not_allowed");

      // 0. Origin check for state-changing requests.
      enforceOrigin(request, logger, config.path);

      // 1. Coarse rate limit by address, before any work is done.
      await enforceRateLimit(config, request, undefined, logger);

      // 2. Authenticate.
      let actor: Actor | null = null;
      if (config.auth !== "public") {
        const authenticate = getApiDeps().authenticate;
        actor = authenticate ? await authenticate(request) : null;
        if (!actor) throw errors.unauthenticated();
        userId = actor.userId;
        logger = requestLogger({ requestId, route: config.path, method: config.method, userId });
        // 3. Role.
        checkRoles(actor, config);
        // Sensitive actions need a recent sign-in. No sign-in time on record counts as stale.
        if (config.freshLogin && !(actor.lastSignInAt && isFreshLogin(actor.lastSignInAt))) {
          throw new AppError("fresh_login_required");
        }
        // Second rate limit, per user.
        await enforceRateLimit(config, request, actor.userId, logger);
      }

      // 4. Validate params, query and body.
      const url = new URL(request.url);
      const rawParams = context?.params ? await context.params : {};
      const params = config.params ? parseWith(config.params, rawParams) : undefined;
      const query = config.query ? parseWith(config.query, queryToObject(url)) : undefined;

      let rawBody = "";
      let body: unknown;
      if (config.body) {
        const type = request.headers.get("content-type") ?? "";
        if (!type.toLowerCase().startsWith("application/json")) {
          throw new AppError("bad_request", { detail: "Send the body as application/json." });
        }
        rawBody = await readBodyText(request, config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
        let json: unknown;
        try {
          json = JSON.parse(rawBody);
        } catch (cause) {
          throw new AppError("invalid_json", { cause });
        }
        body = parseWith(config.body, json);
      }

      const execute = async (): Promise<Response> => {
        const result = await handler({
          request,
          requestId,
          logger,
          actor: actor as HandlerContext<unknown, unknown, unknown, A>["actor"],
          body: body as Parsed<Body>,
          query: query as Parsed<Query>,
          params: params as Parsed<Params>,
        });
        const response = toResponse(result);
        if (config.audit && response.status < 400) {
          const { audit } = getApiDeps();
          if (!audit) {
            if (isProduction())
              throw errors.internal({ cause: new Error("audit writer not configured") });
          } else {
            await audit({
              spec: config.audit,
              actorId: actor?.userId ?? null,
              requestId,
              route: config.path,
              status: response.status,
            });
          }
        }
        return response;
      };

      // 5. Idempotency, then the handler.
      let response: Response;
      if (config.idempotent) {
        const key = request.headers.get("idempotency-key") ?? "";
        if (!IDEMPOTENCY_KEY.test(key)) {
          throw new AppError("bad_request", {
            detail: "A valid Idempotency-Key header is required.",
          });
        }
        const { idempotency } = getApiDeps();
        if (!idempotency)
          throw errors.unavailable({ cause: new Error("idempotency not configured") });
        const requestHash = createHash("sha256")
          .update(`${request.method}\n${url.pathname}${url.search}\n${rawBody}`)
          .digest("hex");
        response = await idempotency({
          key,
          actorId: actor?.userId ?? null,
          route: config.path,
          requestHash,
          execute,
        });
      } else {
        response = await execute();
      }

      status = response.status;
      return withStandardHeaders(response, requestId);
    } catch (error) {
      const response = problemResponse(error, { requestId, logger: logger ?? rootLogger });
      status = response.status;
      return response;
    } finally {
      logger.info({
        event: "request",
        status,
        durationMs: Math.round(performance.now() - started),
      });
    }
  };
}
