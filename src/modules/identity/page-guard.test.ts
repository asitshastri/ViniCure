import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../lib/config/config";
import { guardOutcome } from "./page-guard";

describe("guardOutcome", () => {
  it("sends a visitor with no session to sign-in", () => {
    expect(guardOutcome(null, ["patient"])).toBe("login");
  });
  it("lets the right role in and hides the page from the wrong one", () => {
    expect(guardOutcome(["patient"], ["patient"])).toBe("allow");
    expect(guardOutcome(["doctor"], ["patient"])).toBe("not_found");
    expect(guardOutcome(["patient"], ["admin", "super_admin"])).toBe("not_found");
    expect(guardOutcome(["super_admin"], ["admin", "super_admin"])).toBe("allow");
    expect(guardOutcome([], ["patient"])).toBe("not_found");
  });
  it("the mock preview lets everyone in, only when asked", () => {
    expect(guardOutcome(null, ["admin"], true)).toBe("allow");
    expect(guardOutcome(null, ["admin"], false)).toBe("login");
  });
});

describe("UI_MOCK_SESSION", () => {
  it("is off by default and refused in production", () => {
    expect(loadConfig({}).UI_MOCK_SESSION).toBe(false);
    expect(loadConfig({ UI_MOCK_SESSION: "true" }).UI_MOCK_SESSION).toBe(true);
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        UI_MOCK_SESSION: "true",
        APP_ENV: "production",
        APP_URL: "https://vinicure.example",
      }),
    ).toThrow(/UI_MOCK_SESSION/);
  });
});

// Every layout behind sign-in must call requireRole with the roles the matrix allows.
describe("protected layouts", () => {
  const app = path.resolve(import.meta.dirname, "../../app");
  const expected: Record<string, string> = {
    "(patient)/patient/layout.tsx": '["patient"]',
    "(doctor)/doctor/layout.tsx": '["doctor"]',
    "(admin)/admin/layout.tsx": '["admin", "super_admin"]',
    "(support)/staff/layout.tsx": '["support"]',
    "(call)/layout.tsx": '["patient", "doctor"]',
  };
  for (const [file, roles] of Object.entries(expected)) {
    it(`${file} requires ${roles}`, () => {
      const source = readFileSync(path.join(app, file), "utf8");
      expect(source).toContain(`await requireRole(${roles})`);
      // The guard comes before any rendering or data read.
      expect(source.indexOf("await requireRole")).toBeLessThan(source.indexOf("return"));
    });
  }
});
