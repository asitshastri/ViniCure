import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { buildLoggerOptions, childLogger, newRequestId, requestLogger } from "./logger";
import { REDACTED, isSensitiveKey, redact } from "./redact";

function capture(level = "info") {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const log = pino(buildLoggerOptions(level), stream);
  return { log, lines, last: () => JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown> };
}

describe("logger redaction", () => {
  it("redacts phone, email, tokens, OTP and *_enc fields", () => {
    const { log, lines, last } = capture();
    log.info(
      {
        phone: "+919812345678",
        email: "asha@example.com",
        accessToken: "tok_abc",
        refresh_token: "tok_def",
        otp: "123456",
        notes_enc: "ciphertext",
        diagnosisEnc: "ciphertext2",
        userId: "u-1",
      },
      "sign in",
    );
    const entry = last();
    for (const key of [
      "phone",
      "email",
      "accessToken",
      "refresh_token",
      "otp",
      "notes_enc",
      "diagnosisEnc",
    ]) {
      expect(entry[key]).toBe(REDACTED);
    }
    expect(entry.userId).toBe("u-1");
    const raw = lines.join("");
    for (const secret of [
      "9812345678",
      "asha@example.com",
      "tok_abc",
      "tok_def",
      "123456",
      "ciphertext",
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("redacts nested values, arrays and bound fields", () => {
    const { log, last } = capture();
    childLogger({ phone: "+911111111111" }, log).info({
      user: { name: "Asha", address: "1 Road", list: [{ email: "a@b.in" }] },
    });
    const entry = last() as {
      phone: string;
      user: { name: string; address: string; list: { email: string }[] };
    };
    expect(entry.phone).toBe(REDACTED);
    expect(entry.user.name).toBe(REDACTED);
    expect(entry.user.address).toBe(REDACTED);
    expect(entry.user.list[0]?.email).toBe(REDACTED);
  });

  it("removes Authorization and Cookie headers", () => {
    const { log, lines } = capture();
    log.info({
      req: { headers: { authorization: "Bearer xyz", cookie: "sid=abc", accept: "text/html" } },
    });
    const raw = lines.join("");
    expect(raw).not.toContain("xyz");
    expect(raw).not.toContain("sid=abc");
    expect(raw).toContain("text/html");
  });

  it("scrubs extra fields on errors but keeps the message", () => {
    const { log, lines } = capture();
    const err = Object.assign(new Error("boom"), { phone: "+919800000000" });
    log.error({ err });
    const raw = lines.join("");
    expect(raw).not.toContain("9800000000");
    expect(raw).toContain("boom");
  });

  it("handles circular objects", () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;
    expect(() => redact(loop)).not.toThrow();
  });

  it("does not flag ordinary keys", () => {
    for (const key of [
      "userId",
      "route",
      "method",
      "status",
      "durationMs",
      "requestId",
      "module",
    ]) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe("request context", () => {
  it("adds request fields to every line", () => {
    const { log, last } = capture();
    requestLogger({ requestId: "req-12345678", route: "/api/v1/x", method: "GET" }, log).info({
      status: 200,
      durationMs: 4,
    });
    expect(last()).toMatchObject({
      requestId: "req-12345678",
      route: "/api/v1/x",
      method: "GET",
      status: 200,
    });
  });

  it("accepts a safe incoming request id and replaces an unsafe one", () => {
    expect(newRequestId("abcd-1234-efgh")).toBe("abcd-1234-efgh");
    expect(newRequestId('bad\nid{"x":1}')).toMatch(/^[0-9a-f-]{36}$/);
    expect(newRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
