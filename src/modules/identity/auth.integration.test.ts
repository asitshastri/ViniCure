import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeEmailProvider, FakeSmsProvider } from "../../lib/adapters/fakes";
import { UUID_PATTERN } from "../../lib/ids";
import { createAuth } from "./auth";
import { invitationCrypto } from "./invitation-crypto";
import { InvitationService, hashToken } from "./invitations";
import { createPhonePlugin } from "./phone";
import { IdentityRepo } from "./repo";
import { PATIENT_SESSION_SECONDS, STAFF_SESSION_SECONDS } from "./session-policy";
import { createStaffPlugins, staffEmailAndPassword } from "./staff";
import { totpCode } from "./totp";

// Runs against real Postgres as the `app` role, with the same Better Auth set-up the app uses
// (phone and staff plugins). Skipped unless DATABASE_TEST_URL is set (see docker/README.md).
// This is where transaction behaviour and role grants are proven; the in-process tests cannot.
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("Better Auth on real Postgres", () => {
  let pool: pg.Pool;
  const origin = "https://vinicure.example";
  const run = Date.now();
  const phone = `+9170${String(run).slice(-8)}`;
  const sms = new FakeSmsProvider();
  const email = new FakeEmailProvider();
  const password = "a long and sturdy passphrase";

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
  });
  afterAll(async () => {
    await pool.query("DELETE FROM invitations WHERE email LIKE $1", [`it-${run}-%`]);
    await pool.query(
      "DELETE FROM user_roles WHERE granted_by IN (SELECT id FROM users WHERE email LIKE $1)",
      [`it-${run}-%`],
    );
    await pool.query("DELETE FROM users WHERE email LIKE $1 OR phone_number = $2", [
      `it-${run}-%`,
      phone,
    ]);
    await pool.end();
  });

  const queryable = () => ({
    query: async (text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
    }),
  });

  const make = () => {
    const repo = new IdentityRepo(queryable());
    return createAuth({
      database: pool,
      secret: "integration-secret-with-at-least-32-characters",
      baseUrl: origin,
      trustedOrigins: [origin],
      production: true,
      rolesOf: (id) => repo.rolesOf(id),
      emailAndPassword: staffEmailAndPassword,
      plugins: [
        ...createStaffPlugins("integration-secret-with-at-least-32-characters"),
        createPhonePlugin({
          sms,
          allowedCountryCodes: ["+91"],
          isStaff: async (id) => (await repo.rolesOf(id)).some((r) => r !== "patient"),
          onVerified: (id) => repo.recordPhoneVerified(id),
        }),
      ],
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

  it("signs a patient up by phone: UUIDv7 ids, patient role, 14 day session, __Host- cookie", async () => {
    const auth = make();
    expect((await post(auth, "/phone-number/send-otp", { phoneNumber: phone })).status).toBe(200);
    const code = sms.sent.at(-1)?.variables.code as string;
    const res = await post(auth, "/phone-number/verify", { phoneNumber: phone, code });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("__Host-vc_session="));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);

    const user = (
      await pool.query(
        "SELECT id, status, email, phone_number_verified, phone_verified_at FROM users WHERE phone_number = $1",
        [phone],
      )
    ).rows[0];
    expect(user.id).toMatch(UUID_PATTERN);
    expect(user.id[14]).toBe("7");
    expect(user.status).toBe("active");
    expect(user.email).toMatch(/@no-email\.invalid$/);
    expect(user.phone_number_verified).toBe(true);
    expect(user.phone_verified_at).toBeInstanceOf(Date);
    expect(await new IdentityRepo(queryable()).rolesOf(user.id)).toEqual(["patient"]);

    const session = (
      await pool.query("SELECT id, expires_at FROM auth_sessions WHERE user_id = $1", [user.id])
    ).rows[0];
    expect(session.id).toMatch(UUID_PATTERN);
    const seconds = (new Date(session.expires_at).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(PATIENT_SESSION_SECONDS - 120);
    expect(seconds).toBeLessThanOrEqual(PATIENT_SESSION_SECONDS);
  });

  async function inviteDoctor(auth: ReturnType<typeof make>, address: string) {
    const repo = new IdentityRepo(queryable());
    const service = new InvitationService({
      repo,
      email,
      crypto: invitationCrypto(auth),
      appUrl: origin,
    });
    // An admin to send it.
    const adminEmail = `it-${run}-admin-${address.length}@example.com`;
    await pool.query(
      "INSERT INTO users (id, name, email) VALUES (gen_random_uuid(), 'Admin', $1) ON CONFLICT DO NOTHING",
      [adminEmail],
    );
    const admin = (await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail])).rows[0];
    await service.create({
      email: address,
      role: "doctor",
      invitedBy: admin.id,
      inviterRoles: ["admin"],
    });
    const token = (email.sent.at(-1)?.variables.link as string).split("/invite/")[1] as string;
    await service.enrol(token);
    const inv = await repo.openInvitation(hashToken(token));
    const secret = await invitationCrypto(auth).unseal(inv?.pendingTotpSecret as string);
    await service.accept({ token, name: "Dr Rao", password, code: totpCode(secret, Date.now()) });
    return { secret, token };
  }

  it("a doctor made by invitation signs in with password and code, and gets an 8 hour session", async () => {
    const auth = make();
    const address = `it-${run}-doctor@example.com`;
    const { secret } = await inviteDoctor(auth, address);

    const first = await post(auth, "/sign-in/email", { email: address, password });
    expect(await first.json()).toMatchObject({ twoFactorRedirect: true });
    const user = (await pool.query("SELECT id FROM users WHERE email = $1", [address])).rows[0];
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1", [
          user.id,
        ])
      ).rows[0].n,
    ).toBe(0); // the password alone leaves no session behind
    const cookie = first.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const second = await post(
      auth,
      "/two-factor/verify-totp",
      { code: totpCode(secret, Date.now()) },
      { cookie },
    );
    expect(second.status).toBe(200);
    const session = (
      await pool.query("SELECT expires_at FROM auth_sessions WHERE user_id = $1", [user.id])
    ).rows[0];
    const seconds = (new Date(session.expires_at).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(STAFF_SESSION_SECONDS - 120);
    expect(seconds).toBeLessThanOrEqual(STAFF_SESSION_SECONDS);
  });

  it("the doctor's phone cannot be used to sign in", async () => {
    const auth = make();
    const address = `it-${run}-doctor2@example.com`;
    await inviteDoctor(auth, address);
    const doctorPhone = `+9171${String(run).slice(-8)}`;
    await pool.query(
      "UPDATE users SET phone_number = $1, phone_number_verified = true WHERE email = $2",
      [doctorPhone, address],
    );
    await post(auth, "/phone-number/send-otp", { phoneNumber: doctorPhone });
    const code = sms.sent.at(-1)?.variables.code as string;
    const res = await post(auth, "/phone-number/verify", { phoneNumber: doctorPhone, code });
    expect(res.status).toBe(403);
    const user = (await pool.query("SELECT id FROM users WHERE email = $1", [address])).rows[0];
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1", [
          user.id,
        ])
      ).rows[0].n,
    ).toBe(0);
    await pool.query("UPDATE users SET phone_number = NULL WHERE email = $1", [address]);
  });

  it("a staff row without an enrolled authenticator gets no session", async () => {
    const auth = make();
    const address = `it-${run}-nofactor@example.com`;
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email: address, name: "No Factor", emailVerified: true },
      { method: "test" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(password),
    });
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, 2)", [user.id]);
    const res = await post(auth, "/sign-in/email", { email: address, password });
    expect(res.status).toBe(403);
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1", [
          user.id,
        ])
      ).rows[0].n,
    ).toBe(0);
  });

  it("refuses a callback URL on another site and a wrong password", async () => {
    const auth = make();
    const address = `it-${run}-doctor@example.com`;
    const evil = await post(auth, "/sign-in/email", {
      email: address,
      password,
      callbackURL: "https://evil.example/x",
    });
    expect(evil.status).toBe(403);
    const wrong = await post(auth, "/sign-in/email", {
      email: address,
      password: "not-the-password-123456",
    });
    expect(wrong.status).toBe(401);
  });
});
