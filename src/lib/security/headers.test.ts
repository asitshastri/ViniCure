import { describe, expect, it } from "vitest";
import { allowsMedia, buildCsp, isOriginAllowed, securityHeaders } from "./headers";

const allowed = ["https://vinicure.example"];

describe("CSP", () => {
  const prod = buildCsp({ nonce: "NONCE", production: true });

  it("is strict in production", () => {
    expect(prod).toContain("default-src 'self'");
    expect(prod).toContain("script-src 'self' 'nonce-NONCE' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("allows eval and websockets only in development", () => {
    const dev = buildCsp({ nonce: "N", production: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost");
    expect(prod).not.toContain("ws://");
  });
});

describe("headers", () => {
  it("matches the snapshot for a normal page in production", () => {
    expect(securityHeaders({ nonce: "N", production: true, pathname: "/doctors" })).toEqual({
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'nonce-N' 'strict-dynamic'; style-src 'self' 'nonce-N'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), serial=(), bluetooth=(), interest-cohort=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });

  it("omits HSTS outside production", () => {
    const headers = securityHeaders({ nonce: "N", production: false, pathname: "/" });
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("allows camera and microphone only on the call pages", () => {
    for (const path of [
      "/consultation/abc",
      "/consultation/abc/lobby",
      "/doctor/consultations/abc",
    ]) {
      expect(allowsMedia(path)).toBe(true);
      const policy = securityHeaders({ nonce: "N", production: true, pathname: path })[
        "Permissions-Policy"
      ];
      expect(policy).toContain("camera=(self), microphone=(self)");
    }
    for (const path of [
      "/",
      "/doctor/consultations",
      "/doctor/dashboard",
      "/patient/appointments",
      "/consultations/x",
      "/api/v1/me",
    ]) {
      expect(allowsMedia(path)).toBe(false);
      const policy = securityHeaders({ nonce: "N", production: true, pathname: path })[
        "Permissions-Policy"
      ];
      expect(policy).toContain("camera=(), microphone=()");
    }
  });
});

describe("origin check", () => {
  const base = { pathname: "/api/v1/x", host: "vinicure.example", allowedOrigins: allowed };

  it("lets safe methods through without an Origin", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(isOriginAllowed({ ...base, method, origin: null })).toBe(true);
    }
  });

  it("allows a write from our own origin", () => {
    expect(isOriginAllowed({ ...base, method: "POST", origin: "https://vinicure.example" })).toBe(
      true,
    );
  });

  it("blocks a write from another site, a missing Origin and an opaque Origin", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isOriginAllowed({ ...base, method, origin: "https://evil.example" })).toBe(false);
      expect(isOriginAllowed({ ...base, method, origin: null })).toBe(false);
      expect(isOriginAllowed({ ...base, method, origin: "null" })).toBe(false);
    }
  });

  it("blocks look-alike origins and garbage", () => {
    const post = { ...base, method: "POST" };
    expect(isOriginAllowed({ ...post, origin: "https://vinicure.example.evil.test" })).toBe(false);
    expect(isOriginAllowed({ ...post, origin: "http://vinicure.example" })).toBe(false);
    expect(isOriginAllowed({ ...post, origin: "not a url" })).toBe(false);
  });

  it("accepts a same-host Origin only when host matching is on (development)", () => {
    const dev = {
      ...base,
      method: "POST",
      origin: "http://localhost:3001",
      host: "localhost:3001",
    };
    expect(isOriginAllowed(dev)).toBe(false);
    expect(isOriginAllowed({ ...dev, allowHostMatch: true })).toBe(true);
  });

  it("lets signed webhook paths through without an Origin", () => {
    const hook = { ...base, method: "POST", pathname: "/api/webhooks/razorpay", origin: null };
    expect(isOriginAllowed(hook)).toBe(true);
  });
});
