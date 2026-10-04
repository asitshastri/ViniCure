import { toJSONSchema, type z } from "zod";
import { ERROR_CODES } from "../errors/codes";
import { listRoutes, type RouteEntry } from "./registry";

// OpenAPI 3.1 document generated from the route registry and the Zod schemas
// that withApi() already validates with, so the document cannot drift from the code.

type Json = Record<string, unknown>;

function schemaOf(schema: z.ZodType): Json {
  const json = { ...(toJSONSchema(schema, { io: "input" }) as Json) };
  delete json.$schema;
  return json;
}

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function pathParamNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] as string);
}

function parametersFor(route: RouteEntry): Json[] {
  const parameters: Json[] = [];
  const paramSchema = route.schemas.params ? schemaOf(route.schemas.params) : undefined;
  const paramProps = (paramSchema?.properties ?? {}) as Record<string, Json>;
  for (const name of pathParamNames(route.path)) {
    parameters.push({
      name,
      in: "path",
      required: true,
      schema: paramProps[name] ?? { type: "string" },
    });
  }
  if (route.schemas.query) {
    const query = schemaOf(route.schemas.query);
    const required = new Set((query.required ?? []) as string[]);
    for (const [name, schema] of Object.entries((query.properties ?? {}) as Record<string, Json>)) {
      parameters.push({ name, in: "query", required: required.has(name), schema });
    }
  }
  if (route.idempotent) {
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" },
    });
  }
  return parameters;
}

function errorResponse(code: keyof typeof ERROR_CODES): Json {
  return {
    description: ERROR_CODES[code].title,
    content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
  };
}

function operationFor(route: RouteEntry): Json {
  const responses: Record<string, Json> = {
    "200": route.doc?.response
      ? {
          description: "Success",
          content: { "application/json": { schema: schemaOf(route.doc.response) } },
        }
      : { description: "Success" },
    "429": errorResponse("rate_limited"),
    "500": errorResponse("internal_error"),
  };
  if (route.auth !== "public") responses["401"] = errorResponse("unauthenticated");
  if (route.roles.length > 0) {
    responses[route.roleDenied === "not_found" ? "404" : "403"] = errorResponse(
      route.roleDenied === "not_found" ? "not_found" : "forbidden",
    );
  }
  if (route.schemas.body || route.schemas.query || route.schemas.params) {
    responses["422"] = errorResponse("validation_failed");
  }

  const operation: Json = {
    summary: route.doc?.summary ?? "",
    tags: route.doc?.tags ?? [],
    parameters: parametersFor(route),
    responses,
    "x-rate-limit-tier": route.rateLimit,
    "x-auth": route.auth,
    "x-roles": route.roles,
    "x-audited": route.audited,
    "x-fresh-login": route.freshLogin,
    "x-full-session": route.fullSession,
  };
  if (route.auth !== "public") operation.security = [{ sessionCookie: [] }];
  if (route.schemas.body) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: schemaOf(route.schemas.body) } },
    };
  }
  return operation;
}

export function buildOpenApi(routes: RouteEntry[] = listRoutes()): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const route of routes) {
    const key = openApiPath(route.path);
    paths[key] ??= {};
    paths[key][route.method.toLowerCase()] = operationFor(route);
  }
  return {
    openapi: "3.1.0",
    info: { title: "ViniCure API", version: "1.0.0" },
    paths,
    components: {
      securitySchemes: {
        // The cookie name is fixed when Better Auth is set up in P2.
        sessionCookie: { type: "apiKey", in: "cookie", name: "session" },
      },
      schemas: {
        Problem: {
          type: "object",
          required: ["type", "title", "status", "code", "detail", "requestId"],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            status: { type: "integer" },
            code: { type: "string", enum: Object.keys(ERROR_CODES) },
            detail: { type: "string" },
            requestId: { type: "string" },
            errors: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "message"],
                properties: { path: { type: "string" }, message: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };
}
