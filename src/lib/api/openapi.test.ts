import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildOpenApi } from "./openapi";
import { clearRoutesForTest, listRoutes } from "./registry";
import { withApi } from "./with-api";

const apiDir = path.resolve(import.meta.dirname, "../../app/api");
const specFile = path.resolve(import.meta.dirname, "../../../docs/openapi.json");

function routeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("generated OpenAPI document", () => {
  beforeEach(() => clearRoutesForTest());

  it("describes parameters, body, security, roles and errors from the route settings", () => {
    withApi(
      {
        method: "POST",
        path: "/api/v1/patients/:id/notes",
        auth: "session",
        roles: ["doctor"],
        rateLimit: "write",
        idempotent: true,
        params: z.strictObject({ id: z.uuid() }),
        query: z.strictObject({ dryRun: z.enum(["true", "false"]).optional() }),
        body: z.strictObject({ note: z.string().min(1).max(2000) }),
        audit: { action: "note.create", entity: "note" },
        doc: { summary: "Add a note", tags: ["clinical"], response: z.object({ id: z.uuid() }) },
      },
      () => ({}),
    );
    const doc = buildOpenApi() as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const op = doc.paths["/api/v1/patients/{id}/notes"]?.post as Record<string, unknown>;
    expect(op.summary).toBe("Add a note");
    expect(op.security).toEqual([{ sessionCookie: [] }]);
    expect(op["x-rate-limit-tier"]).toBe("write");
    expect(op["x-roles"]).toEqual(["doctor"]);
    expect(op["x-audited"]).toBe(true);
    const params = op.parameters as { name: string; in: string; required: boolean }[];
    expect(params.map((p) => `${p.in}:${p.name}`).sort()).toEqual([
      "header:Idempotency-Key",
      "path:id",
      "query:dryRun",
    ]);
    expect(params.find((p) => p.name === "id")?.required).toBe(true);
    expect(JSON.stringify(op.requestBody)).toContain('"additionalProperties":false');
    expect(Object.keys(op.responses as object).sort()).toEqual([
      "200",
      "401",
      "403",
      "422",
      "429",
      "500",
    ]);
  });

  it("marks public routes as needing no session", () => {
    withApi(
      { method: "GET", path: "/api/v1/x", auth: "public", rateLimit: "public_read" },
      () => ({}),
    );
    const doc = buildOpenApi() as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    expect(doc.paths["/api/v1/x"]?.get?.security).toBeUndefined();
  });
});

// CI guard: every route file is documented, and docs/openapi.json is current.
describe("the real API", () => {
  it("documents every route and matches docs/openapi.json", async () => {
    clearRoutesForTest();
    for (const file of routeFiles(apiDir)) {
      // Importing a route file registers its routes through withApi().
      await import(/* @vite-ignore */ file);
    }
    const routes = listRoutes();
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.doc?.summary, `${route.method} ${route.path} needs doc.summary`).toBeTruthy();
    }

    const generated = JSON.stringify(buildOpenApi(routes), null, 2) + "\n";
    if (process.env.UPDATE_OPENAPI === "1") writeFileSync(specFile, generated);
    expect(existsSync(specFile), "run: UPDATE_OPENAPI=1 pnpm test").toBe(true);
    expect(readFileSync(specFile, "utf8").replace(/\r\n/g, "\n")).toBe(generated);
  });
});
