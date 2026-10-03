import { beforeEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";
import { clearReadinessChecksForTest, registerReadinessCheck } from "./checks";

const req = (path: string) => new Request(`http://x.test${path}`);

beforeEach(() => clearReadinessChecksForTest());

describe("/api/health", () => {
  it("answers ok without touching dependencies", async () => {
    registerReadinessCheck("db", async () => {
      throw new Error("down");
    });
    const res = await health(req("/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});

describe("/api/ready", () => {
  it("is ready with no checks and with passing checks", async () => {
    expect((await ready(req("/api/ready"))).status).toBe(200);
    registerReadinessCheck("db", async () => {});
    registerReadinessCheck("cache", async () => {});
    const res = await ready(req("/api/ready"));
    expect(await res.json()).toEqual({ status: "ready", checks: { db: "ok", cache: "ok" } });
  });

  it("returns 503 and names the failing check without leaking the error", async () => {
    registerReadinessCheck("db", async () => {
      throw new Error("password authentication failed for user app at 10.0.0.5");
    });
    registerReadinessCheck("cache", async () => {});
    const res = await ready(req("/api/ready"));
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: "not_ready", checks: { db: "fail", cache: "ok" } });
    expect(text).not.toContain("10.0.0.5");
  });

  it("treats a hanging check as a failure", async () => {
    registerReadinessCheck("slow", () => new Promise(() => {}));
    const res = await ready(req("/api/ready"));
    expect(res.status).toBe(503);
  }, 6000);
});
