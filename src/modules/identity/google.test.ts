import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../lib/api/types";
import { createAuth } from "./auth";
import { GOOGLE_AUTH_PATHS, googleProviders } from "./google";
import { staffEmailAndPassword, createStaffPlugins } from "./staff";

const SECRET = "google-test-secret-with-at-least-thirty-two-chars";
const ORIGIN = "https://vinicure.example";

type Row = Record<string, unknown>;
type Profile = { sub: string; email: string; email_verified?: boolean; name?: string };

// A stand-in for Google: only the server-to-server token call is replaced, so everything else
// (state, PKCE, our hooks, account rules) is the real code path.
let profile: Profile = { sub: "g-1", email: "asha@gmail.com", email_verified: true, name: "Asha" };
const realFetch = globalThis.fetch;
let tokenCalls = 0;

function unsignedJwt(claims: Record<string, unknown>): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.`;
}

beforeEach(() => {
  tokenCalls = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      tokenCalls += 1;
      return new Response(
        JSON.stringify({
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile",
          id_token: unsignedJwt({
            iss: "https://accounts.google.com",
            aud: "client-id",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
            ...profile,
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function setup() {
  const db: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
    auth_two_factor: [],
  };
  const roles = new Map<string, Role[]>();
  const created: string[] = [];
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    production: true,
    rolesOf: async (id) => roles.get(id) ?? [],
    emailAndPassword: staffEmailAndPassword,
    plugins: createStaffPlugins(SECRET),
    socialProviders: googleProviders({ clientId: "client-id", clientSecret: "client-secret" }),
    extraAllowedPaths: GOOGLE_AUTH_PATHS,
    onSocialUserCreated: async (id) => {
      created.push(id);
      roles.set(id, ["patient"]);
    },
  });
  const call = (
    method: "GET" | "POST",
    path: string,
    init: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
  ) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method,
        redirect: "manual",
        headers: {
          ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}),
          ...(init.cookie ? { cookie: init.cookie } : {}),
          ...init.headers,
        },
        body: method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
      }),
    );
  const cookies = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  /** Runs the whole redirect dance for one Google account. Returns the callback response. */
  async function googleSignIn(
    cookie?: string,
    path: "/sign-in/social" | "/link-social" = "/sign-in/social",
  ) {
    const start = await call("POST", path, {
      body: { provider: "google", callbackURL: "/patient/dashboard", errorCallbackURL: "/login" },
      ...(cookie ? { cookie } : {}),
    });
    const body = (await start.json().catch(() => ({}))) as { url?: string };
    if (!body.url) return { start, callback: undefined, session: "" };
    const state = new URL(body.url).searchParams.get("state") as string;
    const jar = [cookie, cookies(start)].filter(Boolean).join("; ");
    const callback = await call("GET", `/callback/google?code=fake-code&state=${state}`, {
      cookie: jar,
    });
    return { start, callback, session: cookies(callback) };
  }
  return { auth, db, roles, created, call, cookies, googleSignIn };
}

const location = (res?: Response) => res?.headers.get("location") ?? "";

describe("signing up and in with Google", () => {
  it("creates a patient account keyed by Google's sub, with the patient role, a session and no tokens kept", async () => {
    const t = setup();
    const { callback, session } = await t.googleSignIn();
    expect(callback?.status).toBe(302);
    expect(location(callback)).toContain("/patient/dashboard");
    expect(t.db.users).toHaveLength(1);
    expect(t.created).toEqual([t.db.users?.[0]?.id]);
    const account = t.db.auth_accounts?.[0] as Row;
    expect(account.provider_id).toBe("google");
    expect(account.account_id).toBe("g-1"); // Google's sub, not the email
    for (const field of ["access_token", "refresh_token", "id_token"]) {
      expect(account[field] ?? null, field).toBeNull();
    }
    expect(JSON.stringify(t.db)).not.toContain("google-access-token");
    expect(JSON.stringify(t.db)).not.toContain("google-refresh-token");
    expect(session).toMatch(/__Host-vc_session=/);
    expect(t.db.auth_sessions).toHaveLength(1);
  });

  it("the same Google account signs back in to the same person even if its email changed", async () => {
    const t = setup();
    await t.googleSignIn();
    profile = { sub: "g-1", email: "asha.new@gmail.com", email_verified: true, name: "Asha" };
    const second = await t.googleSignIn();
    expect(second.callback?.status).toBe(302);
    expect(location(second.callback)).not.toMatch(/error/);
    expect(t.db.users).toHaveLength(1); // matched by sub, not by email
    expect(t.db.auth_accounts).toHaveLength(1);
    expect(t.db.auth_sessions).toHaveLength(2);
  });

  it("a different Google account never reaches someone else's account", async () => {
    const t = setup();
    await t.googleSignIn();
    profile = { sub: "g-2", email: "ravi@gmail.com", email_verified: true, name: "Ravi" };
    await t.googleSignIn();
    expect(t.db.users).toHaveLength(2);
    expect(new Set(t.db.auth_accounts?.map((a) => a.user_id)).size).toBe(2);
  });
});

describe("a Google account cannot take over an existing account by email", () => {
  it("refuses a Google sign-in whose verified email belongs to another account", async () => {
    const t = setup();
    // A person who already holds this email (for example an invited doctor).
    const ctx = await t.auth.$context;
    const doctor = await ctx.internalAdapter.createUser(
      { email: "doctor@gmail.com", name: "Dr", emailVerified: true, twoFactorEnabled: true },
      { method: "test" },
    );
    t.roles.set(doctor.id, ["doctor"]);
    profile = { sub: "g-evil", email: "doctor@gmail.com", email_verified: true, name: "Attacker" };
    const { callback, session } = await t.googleSignIn();
    expect(location(callback)).toMatch(/error=/);
    expect(session).not.toMatch(/__Host-vc_session=/);
    expect(t.db.auth_sessions).toHaveLength(0);
    expect(t.db.auth_accounts).toHaveLength(0); // nothing was attached to the doctor
    expect(t.db.users).toHaveLength(1);
  });

  it("same for a patient whose account already holds the email", async () => {
    const t = setup();
    const ctx = await t.auth.$context;
    const patient = await ctx.internalAdapter.createUser(
      { email: "mira@gmail.com", name: "Mira", emailVerified: true },
      { method: "test" },
    );
    t.roles.set(patient.id, ["patient"]);
    profile = { sub: "g-other", email: "mira@gmail.com", email_verified: true, name: "Not Mira" };
    const { callback } = await t.googleSignIn();
    expect(location(callback)).toMatch(/error=/);
    expect(t.db.auth_sessions).toHaveLength(0);
    expect(t.db.auth_accounts).toHaveLength(0);
  });

  it("an unverified Google email does not help either", async () => {
    const t = setup();
    const ctx = await t.auth.$context;
    await ctx.internalAdapter.createUser(
      { email: "x@gmail.com", name: "X", emailVerified: false },
      { method: "test" },
    );
    profile = { sub: "g-u", email: "x@gmail.com", email_verified: false, name: "U" };
    const { callback } = await t.googleSignIn();
    expect(location(callback)).toMatch(/error=/);
    expect(t.db.auth_accounts).toHaveLength(0);
  });
});

describe("staff cannot use Google", () => {
  it("a staff user with a Google account row gets no session from it", async () => {
    const t = setup();
    const ctx = await t.auth.$context;
    const doctor = await ctx.internalAdapter.createUser(
      { email: "dr@example.com", name: "Dr", emailVerified: true, twoFactorEnabled: true },
      { method: "test" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: doctor.id,
      providerId: "google",
      accountId: "g-staff",
    });
    t.roles.set(doctor.id, ["doctor"]);
    profile = { sub: "g-staff", email: "dr@example.com", email_verified: true };
    const { callback, session } = await t.googleSignIn();
    expect(session).not.toMatch(/__Host-vc_session=/);
    expect(callback?.status, `${callback?.status} ${location(callback)}`).toBeGreaterThanOrEqual(
      300,
    );
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("Google cannot be linked to a staff account", async () => {
    const t = setup();
    const ctx = await t.auth.$context;
    const doctor = await ctx.internalAdapter.createUser(
      { email: "dr@example.com", name: "Dr", emailVerified: true, twoFactorEnabled: true },
      { method: "test" },
    );
    t.roles.set(doctor.id, ["doctor"]);
    // A live, fresh session of the doctor (made directly: staff sign-in is covered elsewhere).
    t.db.auth_sessions?.push({
      id: "s1",
      user_id: doctor.id,
      token: "doctor-token",
      expires_at: new Date(Date.now() + 3_600_000),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const signed = await signedCookie(t, "doctor-token");
    profile = { sub: "g-doc", email: "dr@example.com", email_verified: true };
    const res = await t.call("POST", "/link-social", {
      body: { provider: "google", callbackURL: "/x" },
      cookie: signed,
    });
    expect(res.status).toBe(403);
    expect(t.db.auth_accounts).toHaveLength(0);
  });
});

async function signedCookie(t: ReturnType<typeof setup>, token: string): Promise<string> {
  const ctx = await t.auth.$context;
  const { makeSignature } = await import("better-auth/crypto");
  const signature = await makeSignature(token, ctx.secret);
  return `__Host-vc_session=${encodeURIComponent(`${token}.${signature}`)}`;
}

describe("linking Google to a signed-in patient", () => {
  async function patientSession(
    t: ReturnType<typeof setup>,
    options: { ageMinutes?: number } = {},
  ) {
    const ctx = await t.auth.$context;
    const patient = await ctx.internalAdapter.createUser(
      { email: `p-${Math.random().toString(36).slice(2)}@no-email.invalid`, name: "Patient" },
      { method: "test" },
    );
    t.roles.set(patient.id, ["patient"]);
    const created = new Date(Date.now() - (options.ageMinutes ?? 1) * 60_000);
    t.db.auth_sessions?.push({
      id: `s-${patient.id}`,
      user_id: patient.id,
      token: `tok-${patient.id}`,
      expires_at: new Date(Date.now() + 3_600_000),
      created_at: created,
      updated_at: created,
    });
    return { patient, cookie: await signedCookie(t, `tok-${patient.id}`) };
  }

  it("a fresh session can add Google; the Google sub is attached to that person only", async () => {
    const t = setup();
    const { patient, cookie } = await patientSession(t);
    profile = { sub: "g-link", email: "whatever@gmail.com", email_verified: true };
    const { callback } = await t.googleSignIn(cookie, "/link-social");
    expect(location(callback)).not.toMatch(/error=/);
    const accounts = (t.db.auth_accounts ?? []).filter((a) => a.provider_id === "google");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.user_id).toBe(patient.id);
    expect(accounts[0]?.account_id).toBe("g-link");
    // The person's email was not replaced by Google's.
    const user = t.db.users?.find((u) => u.id === patient.id);
    expect(String(user?.email)).toMatch(/@no-email\.invalid$/);
    expect(t.db.users).toHaveLength(1);
  });

  it("linking needs a session", async () => {
    const t = setup();
    const res = await t.call("POST", "/link-social", {
      body: { provider: "google", callbackURL: "/x" },
    });
    expect(res.status).toBe(401);
  });

  it("linking needs a sign-in within the last 15 minutes", async () => {
    const t = setup();
    const { cookie } = await patientSession(t, { ageMinutes: 16 });
    const res = await t.call("POST", "/link-social", {
      body: { provider: "google", callbackURL: "/x" },
      cookie,
    });
    expect(res.status).toBe(403);
    expect(t.db.auth_accounts).toHaveLength(0);
  });

  it("a Google account already linked to one person cannot also be linked to another", async () => {
    const t = setup();
    const first = await patientSession(t);
    profile = { sub: "g-shared", email: "a@gmail.com", email_verified: true };
    await t.googleSignIn(first.cookie, "/link-social");
    const second = await patientSession(t);
    const { callback } = await t.googleSignIn(second.cookie, "/link-social");
    expect(location(callback)).toMatch(/error=/);
    const rows = (t.db.auth_accounts ?? []).filter((a) => a.account_id === "g-shared");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(first.patient.id);
  });
});

describe("the surface stays small", () => {
  it("an ID token handed in by the browser is not trusted", async () => {
    const t = setup();
    const res = await t.call("POST", "/sign-in/social", {
      body: {
        provider: "google",
        idToken: {
          token: unsignedJwt({ sub: "forged", email: "ceo@gmail.com", email_verified: true }),
        },
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(t.db.users).toHaveLength(0);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("a callback with a wrong state or without a code creates nothing", async () => {
    const t = setup();
    const bad = await t.call("GET", "/callback/google?code=fake&state=not-a-real-state");
    expect(location(bad)).toMatch(/error=|login/);
    const missing = await t.call("GET", "/callback/google");
    expect(missing.status).toBeLessThan(500);
    expect(t.db.users).toHaveLength(0);
    expect(tokenCalls).toBe(0);
  });

  it("another provider name and other callback paths stay closed", async () => {
    const t = setup();
    expect(
      (await t.call("POST", "/sign-in/social", { body: { provider: "github", callbackURL: "/x" } }))
        .status,
    ).toBeGreaterThanOrEqual(400);
    expect((await t.call("GET", "/callback/github?code=x&state=y")).status).toBe(404);
  });

  it("without Google configured, none of the Google paths answers", async () => {
    const auth = createAuth({
      database: memoryAdapter({
        users: [],
        auth_sessions: [],
        auth_accounts: [],
        auth_verifications: [],
      }),
      secret: SECRET,
      baseUrl: ORIGIN,
      trustedOrigins: [ORIGIN],
      production: true,
      rolesOf: async () => [],
    });
    for (const [method, path] of [
      ["POST", "/sign-in/social"],
      ["GET", "/callback/google"],
      ["POST", "/link-social"],
    ] as const) {
      const res = await auth.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method,
          headers: { origin: ORIGIN, "content-type": "application/json" },
          body: method === "POST" ? "{}" : undefined,
        }),
      );
      expect(res.status, path).toBe(404);
    }
  });
});
