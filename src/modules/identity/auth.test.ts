import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import type { Role } from "../../lib/api/types";
import { createAuth, buildAuthOptions } from "./auth";
import {
  FRESH_LOGIN_SECONDS,
  PATIENT_SESSION_SECONDS,
  STAFF_SESSION_SECONDS,
  isFreshLogin,
  isStaff,
  sessionExpiry,
} from "./session-policy";

const SECRET = "test-secret-with-at-least-thirty-two-characters!";

type Row = Record<string, unknown>;

function setup(options: { production: boolean; roles?: Role[] }) {
  const db: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
  };
  const roles = { current: (options.roles ?? ["patient"]) as readonly Role[] };
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseUrl: options.production ? "https://vinicure.example" : "http://localhost:3000",
    trustedOrigins: [options.production ? "https://vinicure.example" : "http://localhost:3000"],
    production: options.production,
    accountState: async () => ({ roles: roles.current, twoFactorEnabled: true, status: "active" }),
    emailAndPassword: { enabled: true, disableSignUp: false },
  });
  const origin = options.production ? "https://vinicure.example" : "http://localhost:3000";
  const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, ...headers },
        body: JSON.stringify(body),
      }),
    );
  return { auth, db, roles, request, origin };
}

async function signUp(ctx: ReturnType<typeof setup>) {
  return ctx.request("/sign-up/email", {
    email: "asha@example.com",
    password: "a-long-test-password-123",
    name: "Asha",
  });
}

describe("session cookie", () => {
  it("in production: __Host- name, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain", async () => {
    const ctx = setup({ production: true });
    const res = await signUp(ctx);
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("__Host-vc_session="));
    expect(cookie, res.headers.getSetCookie().join(" | ")).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
    // Every cookie we set follows the same rules.
    for (const c of res.headers.getSetCookie()) {
      expect(c.startsWith("__Host-"), c).toBe(true);
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/Secure/i);
    }
  });

  it("in development: plain name over http but still HttpOnly and SameSite=Lax", async () => {
    const ctx = setup({ production: false });
    const res = await signUp(ctx);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("vc_session="));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("the cookie lasts as long as the patient session", async () => {
    const ctx = setup({ production: true });
    const res = await signUp(ctx);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("__Host-vc_session="));
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie ?? "")?.[1]);
    expect(maxAge).toBe(PATIENT_SESSION_SECONDS);
  });
});

describe("session lifetimes", () => {
  it("a patient session is stored with a 14 day expiry", async () => {
    const ctx = setup({ production: true, roles: ["patient"] });
    await signUp(ctx);
    const session = ctx.db.auth_sessions?.[0] as { expires_at: Date };
    const seconds = (session.expires_at.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(PATIENT_SESSION_SECONDS - 60);
    expect(seconds).toBeLessThanOrEqual(PATIENT_SESSION_SECONDS);
  });

  it("a staff session is stored with an 8 hour expiry", async () => {
    const ctx = setup({ production: true, roles: ["doctor"] });
    await signUp(ctx);
    const session = ctx.db.auth_sessions?.[0] as { expires_at: Date };
    const seconds = (session.expires_at.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(STAFF_SESSION_SECONDS - 60);
    expect(seconds).toBeLessThanOrEqual(STAFF_SESSION_SECONDS);
  });

  it("is configured for no cookie cache, a freshness window and no renewal", () => {
    const options = buildAuthOptions({
      database: memoryAdapter({}),
      secret: SECRET,
      baseUrl: "https://vinicure.example",
      trustedOrigins: [],
      production: true,
      accountState: async () => null,
    });
    expect(options.session?.cookieCache?.enabled).toBe(false);
    expect(options.session?.freshAge).toBe(FRESH_LOGIN_SECONDS);
    expect(options.session?.disableSessionRefresh).toBe(true);
    expect(options.advanced?.useSecureCookies).toBe(false); // Secure comes from the attributes
    expect(options.advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(options.advanced?.crossSubDomainCookies).toBeUndefined();
    expect(options.advanced?.disableCSRFCheck).toBe(false);
    expect(options.advanced?.disableOriginCheck).toBe(false);
    expect(options.rateLimit?.enabled).toBe(false); // our limiter guards the route
  });
});

describe("trusted origins", () => {
  it("rejects a sign-in request from another site", async () => {
    const ctx = setup({ production: true });
    const res = await ctx.request(
      "/sign-up/email",
      { email: "x@example.com", password: "a-long-test-password-123", name: "X" },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
    expect(ctx.db.users).toHaveLength(0);
  });

  it("rejects a callback URL outside the trusted origins", async () => {
    const ctx = setup({ production: true });
    const res = await ctx.request("/sign-up/email", {
      email: "y@example.com",
      password: "a-long-test-password-123",
      name: "Y",
      callbackURL: "https://evil.example/steal",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("session policy", () => {
  const createdAt = new Date("2026-10-04T00:00:00Z");

  it("staff sessions end 8 hours after sign-in", () => {
    const expiry = sessionExpiry({ roles: ["admin"], createdAt });
    expect(expiry.toISOString()).toBe("2026-10-04T08:00:00.000Z");
  });

  it("patient sessions end 14 days after sign-in", () => {
    const expiry = sessionExpiry({ roles: ["patient"], createdAt });
    expect(expiry.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });

  it("a user with a staff role plus patient is treated as staff", () => {
    expect(isStaff(["patient", "doctor"])).toBe(true);
    expect(isStaff(["patient"])).toBe(false);
    expect(isStaff([])).toBe(false);
  });

  it("fresh login lasts 15 minutes", () => {
    const signedIn = new Date("2026-10-04T10:00:00Z");
    expect(isFreshLogin(signedIn, new Date("2026-10-04T10:14:59Z"))).toBe(true);
    expect(isFreshLogin(signedIn, new Date("2026-10-04T10:15:01Z"))).toBe(false);
  });
});

describe("no renewal", () => {
  async function useSession(roles: Role[]) {
    const ctx = setup({ production: true, roles });
    const res = await signUp(ctx);
    const cookie = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Host-vc_session="))
      ?.split(";")[0] as string;
    const session = ctx.db.auth_sessions?.[0] as {
      expires_at: Date;
      created_at: Date;
      updated_at: Date;
    };
    // Pretend the session is a few hours old, then use it.
    const earlier = new Date(Date.now() - 5 * 3600 * 1000);
    session.created_at = earlier;
    session.updated_at = earlier;
    const before = session.expires_at.getTime();
    const got = await ctx.auth.handler(
      new Request(`${ctx.origin}/api/auth/get-session`, { headers: { cookie } }),
    );
    expect(got.status).toBe(200);
    return { before, after: session.expires_at.getTime() };
  }

  it("using a staff session never extends it past 8 hours from sign-in", async () => {
    const { before, after } = await useSession(["doctor"]);
    expect(after).toBe(before);
  });

  it("using a patient session does not extend it either", async () => {
    const { before, after } = await useSession(["patient"]);
    expect(after).toBe(before);
  });
});
