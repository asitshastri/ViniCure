import { createHmac, randomBytes } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { FakeSmsProvider } from "../../lib/adapters/fakes";
import type { Role } from "../../lib/api/types";
import { createAuth } from "./auth";
import { createPhonePlugin } from "./phone";
import { sessionRefusal, createStaffPlugins, staffEmailAndPassword } from "./staff";

const SECRET = "test-secret-with-at-least-thirty-two-characters!";
const ORIGIN = "https://vinicure.example";
const PASSWORD = "correct horse battery staple";
const PHONE = "+919876543210";

type Row = Record<string, unknown>;

// RFC 6238 TOTP (SHA-1, 6 digits, 30 seconds) for the test authenticator.
function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", Buffer.from(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0xf;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

function setup() {
  const db: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
    auth_two_factor: [],
  };
  const rolesByUser = new Map<string, Role[]>();
  const sms = new FakeSmsProvider();
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    production: true,
    rolesOf: async (id) => rolesByUser.get(id) ?? [],
    emailAndPassword: staffEmailAndPassword,
    plugins: [
      ...createStaffPlugins(),
      createPhonePlugin({
        sms,
        allowedCountryCodes: ["+91"],
        isStaff: async (id) => (rolesByUser.get(id) ?? []).some((r) => r !== "patient"),
        onVerified: async () => undefined,
      }),
    ],
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
        body: JSON.stringify(body),
      }),
    );

  /** Creates a staff account the way the invitation flow will: verified email, password, optional TOTP. */
  async function createStaff(
    options: { role?: Role; enrolled?: boolean; email?: string; phone?: string } = {},
  ) {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      {
        email: options.email ?? "doctor@example.com",
        name: "Dr Rao",
        emailVerified: true,
        twoFactorEnabled: false,
        ...(options.phone ? { phoneNumber: options.phone, phoneNumberVerified: true } : {}),
      },
      { method: "invitation" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(PASSWORD),
    });
    rolesByUser.set(user.id, [options.role ?? "doctor"]);
    const secret = randomBytes(10).toString("hex");
    let backupCodes: string[] = [];
    if (options.enrolled !== false) {
      backupCodes = ["backup0001", "backup0002"];
      await ctx.adapter.create({
        model: "twoFactor",
        data: {
          userId: user.id,
          secret: await symmetricEncrypt({ key: ctx.secretConfig, data: secret }),
          backupCodes: await symmetricEncrypt({
            key: ctx.secretConfig,
            data: JSON.stringify(backupCodes),
          }),
          verified: true,
        },
      });
      await ctx.internalAdapter.updateUser(user.id, { twoFactorEnabled: true });
    }
    return { id: user.id, secret, backupCodes, email: user.email };
  }

  const cookiesOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  const hasSession = (res: Response) =>
    res.headers
      .getSetCookie()
      .some((c) => c.startsWith("__Host-vc_session=") && !/Max-Age=0/i.test(c));

  return { auth, db, post, sms, createStaff, cookiesOf, hasSession, rolesByUser };
}

describe("sessionRefusal", () => {
  it("refuses locked and deleted accounts, and staff without two-factor", () => {
    expect(
      sessionRefusal({ roles: ["patient"], twoFactorEnabled: false, status: "active" }),
    ).toBeNull();
    expect(
      sessionRefusal({ roles: ["doctor"], twoFactorEnabled: true, status: "active" }),
    ).toBeNull();
    expect(sessionRefusal({ roles: ["doctor"], twoFactorEnabled: false, status: "active" })).toBe(
      "two_factor_required",
    );
    for (const role of ["admin", "super_admin", "support"] as const) {
      expect(sessionRefusal({ roles: [role], twoFactorEnabled: false, status: "active" })).toBe(
        "two_factor_required",
      );
    }
    expect(sessionRefusal({ roles: ["patient"], twoFactorEnabled: true, status: "locked" })).toBe(
      "inactive",
    );
    expect(sessionRefusal({ roles: ["patient"], twoFactorEnabled: true, status: "deleted" })).toBe(
      "inactive",
    );
  });
});

describe("staff sign-in: email, password and a mandatory authenticator code", () => {
  it("the password alone gives no session, only a second step", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const res = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ twoFactorRedirect: true });
    expect(t.hasSession(res)).toBe(false);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("the right code completes sign-in with an 8 hour __Host- session", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const first = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const verify = await t.post(
      "/two-factor/verify-totp",
      { code: totp(staff.secret) },
      { cookie: t.cookiesOf(first) },
    );
    expect(verify.status).toBe(200);
    expect(t.hasSession(verify)).toBe(true);
    const session = t.db.auth_sessions?.[0];
    const hours = ((session?.expires_at as Date).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);
  });

  it("a wrong code gives no session", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const first = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const verify = await t.post(
      "/two-factor/verify-totp",
      { code: "000000" },
      { cookie: t.cookiesOf(first) },
    );
    expect(verify.status).toBe(401);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("the code step cannot be done without the password step", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const verify = await t.post("/two-factor/verify-totp", { code: totp(staff.secret) });
    expect(verify.status).toBe(401);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("a wrong password gives no second step and no session", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const res = await t.post("/sign-in/email", {
      email: staff.email,
      password: "wrong password here",
    });
    expect(res.status).toBe(401);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("a backup code works once", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const first = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const ok = await t.post(
      "/two-factor/verify-backup-code",
      { code: "backup0001" },
      { cookie: t.cookiesOf(first) },
    );
    expect(ok.status).toBe(200);
    const second = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const again = await t.post(
      "/two-factor/verify-backup-code",
      { code: "backup0001" },
      { cookie: t.cookiesOf(second) },
    );
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it("'trust this device' is refused, so the code is asked every time", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const first = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const verify = await t.post(
      "/two-factor/verify-totp",
      { code: totp(staff.secret), trustDevice: true },
      { cookie: t.cookiesOf(first) },
    );
    expect(verify.status).toBe(400);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("staff cannot switch two-factor off or re-enrol through the API", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const first = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const done = await t.post(
      "/two-factor/verify-totp",
      { code: totp(staff.secret) },
      { cookie: t.cookiesOf(first) },
    );
    const cookie = t.cookiesOf(done);
    for (const path of [
      "/two-factor/disable",
      "/two-factor/enable",
      "/two-factor/send-otp",
      "/two-factor/verify-otp",
    ]) {
      const res = await t.post(path, { password: PASSWORD, code: "123456" }, { cookie });
      expect(res.status, path).toBe(404);
    }
    const row = t.db.users?.find((u) => u.id === staff.id);
    expect(row?.two_factor_enabled).toBe(true);
  });

  it("a staff account without an enrolled authenticator cannot get any session", async () => {
    const t = setup();
    const staff = await t.createStaff({ enrolled: false });
    const res = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(t.hasSession(res)).toBe(false);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("an unverified email cannot sign in", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const ctx = await t.auth.$context;
    await ctx.internalAdapter.updateUser(staff.id, { emailVerified: false });
    const res = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("nobody can sign up with email and password", async () => {
    const t = setup();
    const res = await t.post("/sign-up/email", {
      email: "new@example.com",
      password: PASSWORD,
      name: "X",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(t.db.users).toHaveLength(0);
  });

  it("a short password is not accepted by the policy settings", () => {
    expect(staffEmailAndPassword.minPasswordLength).toBe(12);
    expect(staffEmailAndPassword.maxPasswordLength).toBe(128);
  });

  it("a locked account gets no session even with the right password and code", async () => {
    const t = setup();
    const staff = await t.createStaff();
    const row = t.db.users?.find((u) => u.id === staff.id);
    if (row) row.status = "locked";
    const first = await t.post("/sign-in/email", { email: staff.email, password: PASSWORD });
    const verify = await t.post(
      "/two-factor/verify-totp",
      { code: totp(staff.secret) },
      { cookie: t.cookiesOf(first) },
    );
    expect(t.hasSession(verify)).toBe(false);
    expect(t.db.auth_sessions).toHaveLength(0);
  });
});

describe("staff cannot sign in by phone alone", () => {
  for (const role of ["doctor", "admin", "super_admin", "support"] as const) {
    it(`${role}: the phone code gives no session`, async () => {
      const t = setup();
      const staff = await t.createStaff({ role, phone: PHONE });
      expect(staff.id).toBeTruthy();
      const send = await t.post("/phone-number/send-otp", { phoneNumber: PHONE });
      expect(send.status).toBe(200);
      const code = t.sms.sent.at(-1)?.variables.code as string;
      const verify = await t.post("/phone-number/verify", { phoneNumber: PHONE, code });
      expect(verify.status).toBe(403);
      expect(t.hasSession(verify)).toBe(false);
      expect(t.db.auth_sessions).toHaveLength(0);
    });
  }

  it("a patient still signs in by phone", async () => {
    const t = setup();
    await t.post("/phone-number/send-otp", { phoneNumber: PHONE });
    const code = t.sms.sent.at(-1)?.variables.code as string;
    const verify = await t.post("/phone-number/verify", { phoneNumber: PHONE, code });
    expect(verify.status).toBe(200);
    expect(t.hasSession(verify)).toBe(true);
  });

  it("the password route of the phone plugin is closed", async () => {
    const t = setup();
    await t.createStaff({ phone: PHONE });
    const res = await t.post("/sign-in/phone-number", { phoneNumber: PHONE, password: PASSWORD });
    expect(res.status).toBe(404);
  });
});
