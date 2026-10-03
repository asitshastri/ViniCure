import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UUID_PATTERN } from "../../lib/ids";
import { createAuth } from "./auth";
import { IdentityRepo } from "./repo";
import { PATIENT_SESSION_SECONDS, STAFF_SESSION_SECONDS } from "./session-policy";

// Runs against the Postgres in docker/compose.yml as the `app` role. Skipped unless
// DATABASE_TEST_URL is set (see docker/README.md).
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("Better Auth on real Postgres", () => {
  let pool: pg.Pool;
  const origin = "https://vinicure.example";
  const run = Date.now();

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 3 });
  });
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE $1", [`it-${run}-%`]);
    await pool.end();
  });

  const make = () => {
    const repo = new IdentityRepo({
      query: async (text, params) => ({ rows: (await pool.query(text, params)).rows }),
    });
    return createAuth({
      database: pool,
      secret: "integration-secret-with-at-least-32-characters",
      baseUrl: origin,
      trustedOrigins: [origin],
      production: true,
      accountState: (id) => repo.accountState(id),
      emailAndPassword: { enabled: true },
    });
  };

  const post = (auth: ReturnType<typeof make>, path: string, body: unknown, headers = {}) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, ...headers },
        body: JSON.stringify(body),
      }),
    );

  it("signs a patient up, stores UUIDv7 ids, a 14 day session and a __Host- cookie", async () => {
    const auth = make();
    const email = `it-${run}-patient@example.com`;
    const res = await post(auth, "/sign-up/email", {
      email,
      password: "a-long-test-password-123",
      name: "Asha",
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("__Host-vc_session="));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);

    const user = (
      await pool.query("SELECT id, status, email_verified FROM users WHERE email = $1", [email])
    ).rows[0];
    expect(user.id).toMatch(UUID_PATTERN);
    expect(user.id[14]).toBe("7");
    expect(user.status).toBe("active");

    const session = (
      await pool.query(
        "SELECT id, expires_at, created_at, token FROM auth_sessions WHERE user_id = $1",
        [user.id],
      )
    ).rows[0];
    expect(session.id).toMatch(UUID_PATTERN);
    const seconds = (new Date(session.expires_at).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(PATIENT_SESSION_SECONDS - 120);
    expect(seconds).toBeLessThanOrEqual(PATIENT_SESSION_SECONDS);
  });

  it("gives a doctor an 8 hour session", async () => {
    const auth = make();
    const email = `it-${run}-doctor@example.com`;
    await post(auth, "/sign-up/email", {
      email,
      password: "a-long-test-password-123",
      name: "Dr Rao",
    });
    const userId = (await pool.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;
    await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, 2)", [userId]);

    const res = await post(auth, "/sign-in/email", { email, password: "a-long-test-password-123" });
    expect(res.status).toBe(200);
    const session = (
      await pool.query("SELECT expires_at FROM auth_sessions WHERE user_id = $1", [userId])
    ).rows[0];
    const seconds = (new Date(session.expires_at).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(STAFF_SESSION_SECONDS - 120);
    expect(seconds).toBeLessThanOrEqual(STAFF_SESSION_SECONDS);
  });

  it("refuses a callback URL on another site and a wrong password", async () => {
    const auth = make();
    const email = `it-${run}-patient@example.com`;
    const evil = await post(auth, "/sign-in/email", {
      email,
      password: "a-long-test-password-123",
      callbackURL: "https://evil.example/x",
    });
    expect(evil.status).toBe(403);
    const wrong = await post(auth, "/sign-in/email", {
      email,
      password: "not-the-password-123456",
    });
    expect(wrong.status).toBe(401);
  });
});
