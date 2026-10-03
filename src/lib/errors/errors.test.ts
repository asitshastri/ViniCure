import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildLoggerOptions } from "../logging/logger";
import { AppError, errors } from "./app-error";
import { ERROR_CODES, type ErrorCode } from "./codes";
import { ALL_ERROR_CODES, problemResponse, toAppError, toProblem } from "./problem";

function testLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { log: pino(buildLoggerOptions("info"), stream), lines };
}

const REQUEST_ID = "01J-test-request";

describe("every error code", () => {
  it.each(ALL_ERROR_CODES)("%s builds a problem-details body", async (code: ErrorCode) => {
    const { log } = testLogger();
    const res = problemResponse(new AppError(code), { requestId: REQUEST_ID, logger: log });
    const body = await res.json();
    expect(res.status).toBe(ERROR_CODES[code].status);
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
    expect(res.headers.get("X-Request-Id")).toBe(REQUEST_ID);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      type: `https://vinicure.example/errors/${code.replaceAll("_", "-")}`,
      title: ERROR_CODES[code].title,
      status: ERROR_CODES[code].status,
      code,
      detail: ERROR_CODES[code].detail,
      requestId: REQUEST_ID,
    });
  });

  it("covers the codes named in the architecture doc", () => {
    for (const code of [
      "unauthenticated",
      "forbidden",
      "not_found",
      "validation_failed",
      "rate_limited",
      "slot_taken",
      "payment_signature_invalid",
      "consent_required",
      "outside_join_window",
      "idempotency_conflict",
      "file_rejected",
    ]) {
      expect(ALL_ERROR_CODES).toContain(code);
    }
  });
});

describe("zod mapping", () => {
  const schema = z.strictObject({ phone: z.string().min(10), age: z.number().int() });

  it("maps issues to paths and messages without echoing submitted values", async () => {
    const parsed = schema.safeParse({ phone: "98", age: "secret-value", extra: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const { log } = testLogger();
    const res = problemResponse(parsed.error, { requestId: REQUEST_ID, logger: log });
    const text = await res.text();
    const body = JSON.parse(text);
    expect(res.status).toBe(422);
    expect(body.code).toBe("validation_failed");
    expect(body.errors.map((e: { path: string }) => e.path).sort()).toEqual(["", "age", "phone"]);
    expect(text).not.toContain("secret-value");
    expect(text).toContain("Unknown field: extra");
  });
});

describe("unknown errors", () => {
  it("become internal_error with no internal text, and are logged with the cause", async () => {
    const { log, lines } = testLogger();
    const res = problemResponse(new Error("connection to db-prod-7 failed at /srv/app.js"), {
      requestId: REQUEST_ID,
      logger: log,
    });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text).code).toBe("internal_error");
    expect(text).not.toContain("db-prod-7");
    expect(text).not.toContain("/srv/app.js");
    expect(lines.join("")).toContain("db-prod-7");
  });

  it("maps a JSON syntax error to invalid_json", () => {
    expect(toAppError(new SyntaxError("Unexpected token")).code).toBe("invalid_json");
  });

  it("never sends the cause of an AppError to the caller", async () => {
    const { log } = testLogger();
    const err = new AppError("unavailable", { cause: new Error("redis password=abc") });
    const text = await problemResponse(err, { requestId: REQUEST_ID, logger: log }).text();
    expect(text).not.toContain("redis");
  });
});

describe("helpers", () => {
  it("rateLimited sets Retry-After rounded up, at least 1", () => {
    const res = problemResponse(errors.rateLimited(0.2), {
      requestId: REQUEST_ID,
      logger: testLogger().log,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1");
    expect(errors.rateLimited(61.5).headers?.["Retry-After"]).toBe("62");
  });

  it("validation includes the issue list", () => {
    const problem = toProblem(
      errors.validation([{ path: "phone", message: "Required" }]),
      REQUEST_ID,
    );
    expect(problem.errors).toEqual([{ path: "phone", message: "Required" }]);
  });

  it("a custom detail replaces the default text", () => {
    expect(toProblem(errors.notFound({ detail: "No such booking." }), REQUEST_ID).detail).toBe(
      "No such booking.",
    );
  });
});
