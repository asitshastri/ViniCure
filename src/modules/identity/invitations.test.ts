import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakeEmailProvider } from "../../lib/adapters/fakes";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { createAuth } from "./auth";
import { invitationCrypto } from "./invitation-crypto";
import {
  InvitationService,
  hashToken,
  mayInvite,
  normalizeEmail,
  INVITATION_TTL_SECONDS,
} from "./invitations";
import { createPhonePlugin } from "./phone";
import { IdentityRepo } from "./repo";
import { createStaffPlugins, staffEmailAndPassword } from "./staff";
import { totpCode } from "./totp";

const SECRET = "test-secret-with-at-least-thirty-two-characters!";
const ORIGIN = "https://vinicure.example";
const GOOD_PASSWORD = "a long and sturdy passphrase";

type Row = Record<string, unknown>;
type T = Awaited<ReturnType<typeof setup>>;

// The invitation SQL runs on real PostgreSQL (PGlite). Better Auth runs on its memory adapter;
// at the end of the happy path the rows written by the SQL are copied into it to prove Better
// Auth can sign that account in (password hash and encrypted secrets are in its format).
let sharedDb: ReturnType<typeof createTestDb> | undefined;

async function setup() {
  sharedDb ??= createTestDb();
  const pg = await sharedDb;
  for (const table of ["invitations", "user_roles", "auth_two_factor", "auth_accounts", "users"]) {
    await pg.db.exec(`DELETE FROM ${table}`);
  }
  const q: Queryable = {
    query: async (text, params) => ({
      rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  const repo = new IdentityRepo(q);
  const mem: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
    auth_two_factor: [],
  };
  const auth = createAuth({
    database: memoryAdapter(mem),
    secret: SECRET,
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    production: true,
    rolesOf: (id) => repo.rolesOf(id),
    emailAndPassword: staffEmailAndPassword,
    plugins: [
      ...createStaffPlugins(),
      createPhonePlugin({
        sms: { sendTemplate: async () => ({ providerId: "x" }) },
        allowedCountryCodes: ["+91"],
        isStaff: async () => false,
        onVerified: async () => undefined,
      }),
    ],
  });
  const email = new FakeEmailProvider();
  let now = Date.now();
  const service = new InvitationService({
    repo,
    email,
    crypto: invitationCrypto(auth),
    appUrl: ORIGIN,
    now: () => now,
  });
  // An admin who sends invitations.
  const adminId = uuidv7();
  await q.query(
    `INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'Admin', 'admin@example.com', true)`,
    [adminId],
  );
  await q.query(
    `INSERT INTO user_roles (user_id, role_id) SELECT $1::uuid, id FROM roles WHERE code = 'admin'`,
    [adminId],
  );
  const tokenOf = (index = -1) => {
    const link = email.sent.at(index)?.variables.link as string;
    return link.split("/invite/")[1] as string;
  };
  const invite = (
    address = "dr.rao@example.com",
    role: "doctor" | "admin" | "support" = "doctor",
  ) => service.create({ email: address, role, invitedBy: adminId, inviterRoles: ["admin"] });
  return {
    pg,
    q,
    repo,
    auth,
    mem,
    email,
    service,
    adminId,
    tokenOf,
    invite,
    setNow: (v: number) => (now = v),
    get now() {
      return now;
    },
  };
}

async function codeOf(t: T, token: string, enrolled: { totpUri: string }): Promise<string> {
  void enrolled;
  const inv = await t.repo.openInvitation(hashToken(token));
  const secret = await invitationCrypto(t.auth).unseal(inv?.pendingTotpSecret as string);
  return totpCode(secret, t.now);
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

let t: T;
beforeEach(async () => {
  t = await setup();
}, 60_000);

describe("helpers", () => {
  it("normalizes emails and rejects junk", () => {
    expect(normalizeEmail("  Dr.Rao@Example.COM ")).toBe("dr.rao@example.com");
    for (const bad of ["", "no-at-sign", "a@b", "a b@c.com", "x".repeat(300) + "@a.com"]) {
      expect(normalizeEmail(bad), bad).toBeNull();
    }
  });
  it("only a super admin may invite an admin; nobody but staff may invite", () => {
    expect(mayInvite(["admin"], "doctor")).toBe(true);
    expect(mayInvite(["admin"], "support")).toBe(true);
    expect(mayInvite(["admin"], "admin")).toBe(false);
    expect(mayInvite(["super_admin"], "admin")).toBe(true);
    for (const role of ["patient", "doctor", "support"] as const) {
      expect(mayInvite([role], "doctor"), role).toBe(false);
    }
  });
});

describe("creating an invitation", () => {
  it("stores only a hash of the token and emails the link", async () => {
    await t.invite();
    expect(t.email.sent).toHaveLength(1);
    const message = t.email.sent[0];
    expect(message?.to).toBe("dr.rao@example.com");
    expect(message?.templateKey).toBe("staff_invitation");
    const token = t.tokenOf();
    expect(token.length).toBeGreaterThanOrEqual(43);
    const { rows } = await t.q.query(`SELECT token_hash, expires_at FROM invitations`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    const hours = ((rows[0]?.expires_at as Date).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(INVITATION_TTL_SECONDS / 3600);
  });

  it("a new invitation to the same address replaces the old link", async () => {
    await t.invite();
    const first = t.tokenOf();
    await t.invite();
    const second = t.tokenOf();
    expect(second).not.toBe(first);
    expect(await t.repo.openInvitation(hashToken(first))).toBeNull();
    expect(await t.repo.openInvitation(hashToken(second))).not.toBeNull();
  });

  it("refuses an address that already has an account, a bad address and a role the inviter may not give", async () => {
    expect((await errorOf(t.invite("admin@example.com"))).code).toBe("conflict");
    expect((await errorOf(t.invite("not-an-email"))).code).toBe("validation_failed");
    expect(
      (
        await errorOf(
          t.service.create({
            email: "a@example.com",
            role: "admin",
            invitedBy: t.adminId,
            inviterRoles: ["admin"],
          }),
        )
      ).code,
    ).toBe("forbidden");
    expect(
      (
        await errorOf(
          t.service.create({
            email: "a@example.com",
            role: "doctor",
            invitedBy: t.adminId,
            inviterRoles: ["patient"],
          }),
        )
      ).code,
    ).toBe("forbidden");
    // super_admin is not an invitable role at all.
    expect(
      (
        await errorOf(
          t.service.create({
            email: "a@example.com",
            role: "super_admin" as never,
            invitedBy: t.adminId,
            inviterRoles: ["super_admin"],
          }),
        )
      ).code,
    ).toBe("forbidden");
    expect(t.email.sent).toHaveLength(0);
  });

  it("if the email cannot be sent, the link is closed", async () => {
    t.email.failures.failNext();
    expect((await errorOf(t.invite())).code).toBe("unavailable");
    const { rows } = await t.q.query(`SELECT revoked_at FROM invitations`);
    expect(rows[0]?.revoked_at).toBeInstanceOf(Date);
  });
});

describe("accepting an invitation", () => {
  async function enrolled() {
    await t.invite();
    const token = t.tokenOf();
    const step = await t.service.enrol(token);
    return { token, step };
  }

  it("enrolment shows an authenticator address and 10 backup codes", async () => {
    const { step } = await enrolled();
    expect(step.email).toBe("dr.rao@example.com");
    expect(step.role).toBe("doctor");
    expect(step.totpUri).toMatch(/^otpauth:\/\/totp\/ViniCure:dr\.rao%40example\.com\?/);
    const params = new URL(step.totpUri).searchParams;
    expect(params.get("digits")).toBe("6");
    expect(params.get("period")).toBe("30");
    expect(params.get("secret")).toMatch(/^[A-Z2-7]+$/);
    expect(step.backupCodes).toHaveLength(10);
    expect(new Set(step.backupCodes).size).toBe(10);
    // The secret is stored sealed, never in the clear.
    const { rows } = await t.q.query(`SELECT pending_totp_secret FROM invitations`);
    expect(String(rows[0]?.pending_totp_secret)).not.toContain(params.get("secret") as string);
  });

  it("creates the account in one go and Better Auth can sign it in with password and code", async () => {
    const { token, step } = await enrolled();
    const code = await codeOf(t, token, step);
    const made = await t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code });
    expect(made.email).toBe("dr.rao@example.com");

    const user = (await t.q.query(`SELECT * FROM users WHERE id = $1`, [made.userId])).rows[0];
    expect(user).toMatchObject({
      email: "dr.rao@example.com",
      email_verified: true,
      two_factor_enabled: true,
      status: "active",
      name: "Dr Rao",
    });
    expect(await t.repo.rolesOf(made.userId)).toEqual(["doctor"]);
    const inv = (
      await t.q.query(
        `SELECT accepted_at, accepted_user_id, pending_totp_secret, pending_backup_codes FROM invitations`,
      )
    ).rows[0];
    expect(inv?.accepted_at).toBeInstanceOf(Date);
    expect(inv?.accepted_user_id).toBe(made.userId);
    expect(inv?.pending_totp_secret).toBeNull();
    expect(inv?.pending_backup_codes).toBeNull();
    const granted = (
      await t.q.query(`SELECT granted_by FROM user_roles WHERE user_id = $1`, [made.userId])
    ).rows[0];
    expect(granted?.granted_by).toBe(t.adminId);

    // Copy what the SQL wrote into Better Auth's memory store and sign in.
    for (const [table, sql] of [
      ["users", `SELECT * FROM users WHERE id = '${made.userId}'`],
      ["auth_accounts", `SELECT * FROM auth_accounts WHERE user_id = '${made.userId}'`],
      ["auth_two_factor", `SELECT * FROM auth_two_factor WHERE user_id = '${made.userId}'`],
    ] as const) {
      t.mem[table]?.push(...(await t.q.query(sql)).rows);
    }
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      t.auth.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
          body: JSON.stringify(body),
        }),
      );
    const signInStep = async () => {
      const res = await post("/sign-in/email", {
        email: "dr.rao@example.com",
        password: GOOD_PASSWORD,
      });
      expect(await res.json()).toMatchObject({ twoFactorRedirect: true });
      return res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    };
    const stored = t.mem.auth_two_factor?.[0];
    const secret = await invitationCrypto(t.auth).unseal(String(stored?.secret));
    const byCode = await post(
      "/two-factor/verify-totp",
      { code: totpCode(secret, Date.now()) },
      { cookie: await signInStep() },
    );
    expect(byCode.status).toBe(200);
    expect(byCode.headers.getSetCookie().some((c) => c.startsWith("__Host-vc_session="))).toBe(
      true,
    );
    // The backup codes shown at enrolment work too.
    const byBackup = await post(
      "/two-factor/verify-backup-code",
      { code: step.backupCodes[3] },
      { cookie: await signInStep() },
    );
    expect(byBackup.status).toBe(200);
  });

  it("a link works once", async () => {
    const { token, step } = await enrolled();
    const code = await codeOf(t, token, step);
    await t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code });
    expect(
      (await errorOf(t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code })))
        .code,
    ).toBe("not_found");
    expect((await errorOf(t.service.enrol(token))).code).toBe("not_found");
    const { rows } = await t.q.query(
      `SELECT count(*)::int AS n FROM users WHERE email = 'dr.rao@example.com'`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("two simultaneous acceptances create one account", async () => {
    const { token, step } = await enrolled();
    const code = await codeOf(t, token, step);
    const results = await Promise.allSettled([
      t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code }),
      t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const { rows } = await t.q.query(
      `SELECT count(*)::int AS n FROM users WHERE email = 'dr.rao@example.com'`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("an expired link is refused, whatever the step", async () => {
    const { token, step } = await enrolled();
    const code = await codeOf(t, token, step);
    await t.q.query(`UPDATE invitations SET expires_at = now() - interval '1 second'`);
    expect((await errorOf(t.service.enrol(token))).code).toBe("not_found");
    expect(
      (await errorOf(t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code })))
        .code,
    ).toBe("not_found");
    expect(
      (await t.q.query(`SELECT 1 FROM users WHERE email = 'dr.rao@example.com'`)).rows,
    ).toHaveLength(0);
  });

  it("a revoked link and a made-up link get the same answer as an expired one", async () => {
    const { token } = await enrolled();
    await t.q.query(`UPDATE invitations SET revoked_at = now()`);
    const revoked = await errorOf(t.service.enrol(token));
    const unknown = await errorOf(t.service.enrol("x".repeat(43)));
    expect(revoked.code).toBe("not_found");
    expect(revoked.detail).toBe(unknown.detail);
    expect(revoked.status).toBe(unknown.status);
  });

  it("a wrong code creates nothing, and 5 wrong codes burn the link", async () => {
    const { token, step } = await enrolled();
    const real = await codeOf(t, token, step);
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const error = await errorOf(
        t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code: wrong }),
      );
      expect(error.code).toBe("validation_failed");
    }
    // Even the right code no longer works.
    expect(
      (
        await errorOf(
          t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code: real }),
        )
      ).code,
    ).toBe("not_found");
    expect(
      (await t.q.query(`SELECT 1 FROM users WHERE email = 'dr.rao@example.com'`)).rows,
    ).toHaveLength(0);
  });

  it("refuses a weak password before the code is checked, without costing an attempt", async () => {
    const { token, step } = await enrolled();
    const code = await codeOf(t, token, step);
    for (const password of ["short", "password12345", "aaaaaaaaaaaaaaaa", "dr.rao-is-my-name-1"]) {
      const error = await errorOf(t.service.accept({ token, name: "Dr Rao", password, code }));
      expect(error.code, password).toBe("validation_failed");
      expect(error.issues?.[0]?.path).toBe("password");
    }
    const { rows } = await t.q.query(`SELECT failed_attempts FROM invitations`);
    expect(rows[0]?.failed_attempts).toBe(0);
  });

  it("needs enrolment first, and a bad name is refused", async () => {
    await t.invite();
    const token = t.tokenOf();
    expect(
      (
        await errorOf(
          t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code: "123456" }),
        )
      ).code,
    ).toBe("bad_request");
    await t.service.enrol(token);
    expect(
      (
        await errorOf(
          t.service.accept({ token, name: "x", password: GOOD_PASSWORD, code: "123456" }),
        )
      ).issues?.[0]?.path,
    ).toBe("name");
  });

  it("a second enrolment replaces the first secret: the old code no longer works", async () => {
    await t.invite();
    const token = t.tokenOf();
    await t.service.enrol(token);
    const oldCode = await codeOf(t, token, { totpUri: "" });
    await t.service.enrol(token);
    const newCode = await codeOf(t, token, { totpUri: "" });
    if (oldCode !== newCode) {
      expect(
        (
          await errorOf(
            t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code: oldCode }),
          )
        ).code,
      ).toBe("validation_failed");
    }
    await expect(
      t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code: newCode }),
    ).resolves.toBeTruthy();
  });

  it("a person who already has an account cannot be created twice, even through a stale link", async () => {
    const { token, step } = await enrolled();
    const code = await codeOf(t, token, step);
    await t.q.query(
      `INSERT INTO users (id, name, email) VALUES ($1, 'Taken', 'dr.rao@example.com')`,
      [uuidv7()],
    );
    expect(
      (await errorOf(t.service.accept({ token, name: "Dr Rao", password: GOOD_PASSWORD, code })))
        .code,
    ).toBe("conflict");
    const { rows } = await t.q.query(`SELECT accepted_at FROM invitations`);
    expect(rows[0]?.accepted_at).toBeNull(); // rolled back with everything else
  });
});
