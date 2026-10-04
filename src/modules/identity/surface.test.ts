import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { FakeSmsProvider } from "../../lib/adapters/fakes";
import { createAuth } from "./auth";
import { createPhonePlugin } from "./phone";
import { createStaffPlugins, staffEmailAndPassword } from "./staff";
import {
  ALLOWED_AUTH_PATHS,
  CLOSED_AUTH_PATHS,
  hashIdentifier,
  isAllowedAuthPath,
  stripTokens,
} from "./surface";

const ORIGIN = "https://vinicure.example";
const PHONE = "+919876543210";

type Row = Record<string, unknown>;

function setup() {
  const db: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
    auth_two_factor: [],
  };
  const sms = new FakeSmsProvider();
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: "test-secret-with-at-least-thirty-two-characters!",
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    production: true,
    rolesOf: async () => ["patient"],
    emailAndPassword: staffEmailAndPassword,
    plugins: [
      ...createStaffPlugins(),
      createPhonePlugin({
        sms,
        allowedCountryCodes: ["+91"],
        isStaff: async () => false,
        onVerified: async () => undefined,
      }),
    ],
  });
  const call = (method: "GET" | "POST", path: string, body?: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(method === "POST" ? { origin: ORIGIN } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      }),
    );
  async function signInByPhone() {
    await call("POST", "/phone-number/send-otp", { phoneNumber: PHONE });
    const code = sms.sent.at(-1)?.variables.code as string;
    const res = await call("POST", "/phone-number/verify", { phoneNumber: PHONE, code });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { res, cookie };
  }
  return { auth, db, call, signInByPhone };
}

describe("the HTTP surface of Better Auth is classified, endpoint by endpoint", () => {
  it("every endpoint of the configured instance is either allowed or closed on purpose", () => {
    const { auth } = setup();
    const api = auth.api as unknown as Record<string, { path?: string }>;
    const paths = new Set(
      Object.values(api)
        .map((endpoint) => endpoint.path)
        .filter((path): path is string => typeof path === "string"),
    );
    // Server-only endpoints have no path and cannot be reached over HTTP.
    const unclassified = [...paths].filter(
      (path) => !ALLOWED_AUTH_PATHS.has(path) && !(path in CLOSED_AUTH_PATHS),
    );
    expect(
      unclassified,
      `New Better Auth endpoints need a decision in src/modules/identity/surface.ts: ${unclassified.join(", ")}`,
    ).toEqual([]);
    // And the lists name only endpoints that exist, so they cannot rot.
    const stale = [...ALLOWED_AUTH_PATHS, ...Object.keys(CLOSED_AUTH_PATHS)].filter(
      (path) => !paths.has(path),
    );
    expect(stale, `Not in Better Auth any more: ${stale.join(", ")}`).toEqual([]);
  });

  it("no path is both allowed and closed", () => {
    for (const path of ALLOWED_AUTH_PATHS) expect(path in CLOSED_AUTH_PATHS, path).toBe(false);
  });

  it("every closed path answers 404, signed in or not", async () => {
    const t = setup();
    const { cookie } = await t.signInByPhone();
    for (const path of Object.keys(CLOSED_AUTH_PATHS)) {
      const concrete = path.replace(":token", "abc").replace(":id", "google");
      for (const method of ["GET", "POST"] as const) {
        for (const c of [undefined, cookie]) {
          const res = await t.call(method, concrete, {}, c);
          expect(res.status, `${method} ${path}`).toBe(404);
        }
      }
    }
  });

  it("an unknown path answers 404, and extra paths can be opened on purpose", () => {
    expect(isAllowedAuthPath("/something-new")).toBe(false);
    expect(isAllowedAuthPath("/something-new", new Set(["/something-new"]))).toBe(true);
  });
});

describe("tokens stay in the cookie", () => {
  it("sign-in and get-session answers carry no token, while the cookie works", async () => {
    const t = setup();
    const { res, cookie } = await t.signInByPhone();
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toMatch(/"token"/);
    const session = await t.call("GET", "/get-session", undefined, cookie);
    expect(session.status).toBe(200);
    const body = (await session.json()) as { session?: Record<string, unknown>; user?: unknown };
    expect(body.session).toBeTruthy(); // the session is still reported ...
    expect(body.session).not.toHaveProperty("token"); // ... without its token
    expect(JSON.stringify(body)).not.toContain(
      String(t.db.auth_sessions?.[0]?.token ?? "no-such-token"),
    );
  });

  it("stripTokens removes the token and only the token", () => {
    expect(stripTokens({ token: "t", user: { id: 1 } })).toEqual({ user: { id: 1 } });
    expect(stripTokens({ session: { id: "s", token: "t" }, user: 1 })).toEqual({
      session: { id: "s" },
      user: 1,
    });
    const untouched = { a: 1 };
    expect(stripTokens(untouched)).toBe(untouched);
    expect(stripTokens(null)).toBeNull();
    expect(stripTokens([1])).toEqual([1]);
  });
});

describe("/update-user changes the display name and nothing else", () => {
  it("accepts name; refuses phone, email, image, role, two-factor and status", async () => {
    const t = setup();
    const { cookie } = await t.signInByPhone();
    expect((await t.call("POST", "/update-user", { name: "Asha Verma" }, cookie)).status).toBe(200);
    for (const body of [
      { phoneNumber: "+919999999999" },
      { phoneNumberVerified: true },
      { email: "x@example.com" },
      { image: "https://evil.example/x.png" },
      { twoFactorEnabled: false },
      { status: "active" },
      { role: "admin" },
      { name: "Ok", phoneNumber: "+919999999999" },
      {},
    ]) {
      const res = await t.call("POST", "/update-user", body, cookie);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const user = t.db.users?.[0];
    expect(user?.name).toBe("Asha Verma");
    expect(user?.phone_number).toBe(PHONE);
  });
});

describe("phone numbers are not stored in the clear in auth_verifications", () => {
  it("stores a keyed hash of the number and still verifies the code", async () => {
    const t = setup();
    const { res } = await t.signInByPhone();
    expect(res.status).toBe(200);
    // Whatever rows remain (or were written) hold no digits of the number.
    expect(JSON.stringify(t.db.auth_verifications)).not.toContain("9876543210");
    const hash = await hashIdentifier("test-secret-with-at-least-thirty-two-characters!")(PHONE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(
      await hashIdentifier("another-secret-with-at-least-thirty-two-chars!!")(PHONE),
    );
  });

  it("the code for the number is stored under the hash while it waits", async () => {
    const t = setup();
    await t.call("POST", "/phone-number/send-otp", { phoneNumber: PHONE });
    const rows = t.db.auth_verifications ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).toBe(
      await hashIdentifier("test-secret-with-at-least-thirty-two-characters!")(PHONE),
    );
  });
});
