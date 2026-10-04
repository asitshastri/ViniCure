import { randomBytes } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import type { Role } from "../../lib/api/types";
import { createAuth } from "./auth";
import { createStaffPlugins, staffEmailAndPassword } from "./staff";

const SECRET = "reset-test-secret-with-at-least-thirty-two-chars";
const ORIGIN = "https://vinicure.example";
const OLD = "an old sturdy passphrase here";
const NEW = "a brand new sturdy passphrase";

type Row = Record<string, unknown>;

function setup(options: { sendDelayMs?: number; sendFails?: boolean } = {}) {
  const db: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
    auth_two_factor: [],
  };
  const roles = new Map<string, Role[]>();
  const sent: { to: string; token: string }[] = [];
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    production: true,
    rolesOf: async (id) => roles.get(id) ?? [],
    emailAndPassword: staffEmailAndPassword,
    plugins: createStaffPlugins(SECRET),
    sendPasswordReset: async (input) => {
      if (options.sendDelayMs) await new Promise((r) => setTimeout(r, options.sendDelayMs));
      if (options.sendFails) throw new Error("provider down");
      sent.push(input);
    },
  });
  const post = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  async function account(email: string, role: Role, password = OLD) {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email, name: "Person", emailVerified: true, twoFactorEnabled: role !== "patient" },
      { method: "test" },
    );
    if (role !== "patient" || password) {
      await ctx.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await ctx.password.hash(password),
      });
    }
    roles.set(user.id, [role]);
    if (role !== "patient") {
      await ctx.adapter.create({
        model: "twoFactor",
        data: {
          userId: user.id,
          secret: await symmetricEncrypt({
            key: ctx.secretConfig,
            data: randomBytes(10).toString("hex"),
          }),
          backupCodes: await symmetricEncrypt({ key: ctx.secretConfig, data: "[]" }),
          verified: true,
        },
      });
    }
    return user;
  }
  // A live session row, as a completed sign-in leaves it.
  function session(userId: string) {
    db.auth_sessions?.push({
      id: randomBytes(8).toString("hex"),
      user_id: userId,
      token: randomBytes(16).toString("hex"),
      expires_at: new Date(Date.now() + 3_600_000),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  const waitForMail = async () => {
    for (let i = 0; i < 50 && sent.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
  };
  return { auth, db, post, account, session, sent, waitForMail, roles };
}

const request = (t: ReturnType<typeof setup>, email: string) =>
  t.post("/request-password-reset", { email });

describe("requesting a reset link", () => {
  it("emails a staff member a link with a token", async () => {
    const t = setup();
    await t.account("dr@example.com", "doctor");
    const res = await request(t, "dr@example.com");
    expect(res.status).toBe(200);
    await t.waitForMail();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.to).toBe("dr@example.com");
    expect(t.sent[0]?.token.length).toBeGreaterThanOrEqual(20);
  });

  it("gives exactly the same answer for an unknown address, a patient and a staff member", async () => {
    const t = setup();
    await t.account("dr@example.com", "doctor");
    await t.account("patient@example.com", "patient");
    const answers = [];
    for (const email of [
      "dr@example.com",
      "nobody@example.com",
      "patient@example.com",
      "NOBODY@EXAMPLE.COM",
    ]) {
      const res = await request(t, email);
      answers.push({ status: res.status, body: await res.json() });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    await t.waitForMail();
    expect(t.sent.map((s) => s.to)).toEqual(["dr@example.com"]); // only the staff member got mail
  });

  it("a slow or failing email provider does not change or delay the answer", async () => {
    const slow = setup({ sendDelayMs: 600 });
    await slow.account("dr@example.com", "doctor");
    const started = Date.now();
    const res = await request(slow, "dr@example.com");
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(500);
    const broken = setup({ sendFails: true });
    await broken.account("dr@example.com", "doctor");
    const answer = await request(broken, "dr@example.com");
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ status: true });
  });

  it("the Better Auth redirect route is closed; only our own page takes the token", async () => {
    const t = setup();
    const res = await t.auth.handler(
      new Request(`${ORIGIN}/api/auth/reset-password/sometoken?callbackURL=https://evil.example`),
    );
    expect(res.status).toBe(404);
  });
});

describe("using the link", () => {
  async function linkFor(t: ReturnType<typeof setup>, email = "dr@example.com") {
    await request(t, email);
    await t.waitForMail();
    return t.sent.at(-1)?.token as string;
  }

  it("sets the new password; the old one stops working; the link works once", async () => {
    const t = setup();
    await t.account("dr@example.com", "doctor");
    const token = await linkFor(t);
    const done = await t.post("/reset-password", { token, newPassword: NEW });
    expect(done.status).toBe(200);
    expect(
      (await t.post("/sign-in/email", { email: "dr@example.com", password: OLD })).status,
    ).toBe(401);
    const fresh = await t.post("/sign-in/email", { email: "dr@example.com", password: NEW });
    expect(await fresh.json()).toMatchObject({ twoFactorRedirect: true }); // two-factor still applies
    const again = await t.post("/reset-password", {
      token,
      newPassword: "yet another sturdy passphrase",
    });
    expect(again.status).toBe(400);
    expect(
      (
        await t.post("/sign-in/email", {
          email: "dr@example.com",
          password: "yet another sturdy passphrase",
        })
      ).status,
    ).toBe(401);
  });

  it("ends every session of the account", async () => {
    const t = setup();
    const user = await t.account("dr@example.com", "doctor");
    t.session(user.id);
    t.session(user.id);
    expect(t.db.auth_sessions).toHaveLength(2);
    const token = await linkFor(t);
    expect((await t.post("/reset-password", { token, newPassword: NEW })).status).toBe(200);
    expect(t.db.auth_sessions).toHaveLength(0);
  });

  it("an expired link is refused", async () => {
    const t = setup();
    await t.account("dr@example.com", "doctor");
    const token = await linkFor(t);
    for (const row of t.db.auth_verifications ?? []) row.expires_at = new Date(Date.now() - 1000);
    const res = await t.post("/reset-password", { token, newPassword: NEW });
    expect(res.status).toBe(400);
    expect(
      (await t.post("/sign-in/email", { email: "dr@example.com", password: OLD })).status,
    ).toBe(200);
  });

  it("the link lasts 30 minutes", async () => {
    const t = setup();
    await t.account("dr@example.com", "doctor");
    await linkFor(t);
    const row = t.db.auth_verifications?.[0] as Row;
    const minutes = ((row.expires_at as Date).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it("a weak new password is refused without using up the link", async () => {
    const t = setup();
    await t.account("doctor.rao@example.com", "doctor");
    const token = await linkFor(t, "doctor.rao@example.com");
    for (const weak of [
      "short",
      "password12345",
      "aaaaaaaaaaaaaaaa",
      "my-doctor.rao-passphrase-1",
      "x".repeat(200),
    ]) {
      const res = await t.post("/reset-password", { token, newPassword: weak });
      expect(res.status, weak.slice(0, 20)).toBe(400);
    }
    expect((await t.post("/reset-password", { token, newPassword: NEW })).status).toBe(200);
  });

  it("a made-up token and a missing token are refused the same way", async () => {
    const t = setup();
    await t.account("dr@example.com", "doctor");
    const wrong = await t.post("/reset-password", {
      token: "made-up-token-value-000",
      newPassword: NEW,
    });
    const missing = await t.post("/reset-password", { newPassword: NEW });
    expect(wrong.status).toBe(400);
    expect(missing.status).toBe(400);
  });

  it("a token that belongs to a patient cannot give a patient a password", async () => {
    const t = setup();
    const patient = await t.account("patient@example.com", "patient", "");
    const ctx = await t.auth.$context;
    await ctx.internalAdapter.createVerificationValue({
      identifier: "reset-password:patient-token-0000000000",
      value: patient.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await t.post("/reset-password", {
      token: "patient-token-0000000000",
      newPassword: NEW,
    });
    expect(res.status).toBe(400);
    expect(
      t.db.auth_accounts?.some((a) => a.userId === patient.id || a.user_id === patient.id),
    ).toBe(false);
    const signIn = await t.post("/sign-in/email", { email: "patient@example.com", password: NEW });
    expect(signIn.status).toBeGreaterThanOrEqual(400);
  });
});
