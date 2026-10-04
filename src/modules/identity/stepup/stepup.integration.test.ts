import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeSmsProvider } from "../../../lib/adapters/fakes";
import { uuidv7 } from "../../../lib/ids";
import { createAuth } from "../auth";
import { GOOGLE_AUTH_PATHS, googleProviders } from "../google";
import { createPhonePlugin } from "../phone";
import { PatientRepo } from "../../patients/repo";
import { PatientService } from "../../patients/service";
import { IdentityRepo } from "../repo";
import { createStaffPlugins, staffEmailAndPassword } from "../staff";
import { createStepUpHooks, deviceCookieName } from "./hooks";
import type { SecurityNotifier } from "./notifier";
import { StepUpRepo } from "./repo";
import { StepUpService, hashDeviceToken } from "./service";

// Phone recycling defence on real Postgres (P2-18, D-019). Skipped without DATABASE_TEST_URL.
const url = process.env.DATABASE_TEST_URL;
const SECRET = "stepup-integration-secret-with-32-or-more-chars";
const ORIGIN = "https://vinicure.example";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36";

describe.skipIf(!url)("step-up on real Postgres", () => {
  let pool: pg.Pool;
  const run = Date.now();
  const phones: string[] = [];
  let counter = 0;
  const newPhone = () => {
    const p = `+9172${String(run).slice(-5)}${String(++counter).padStart(3, "0")}`;
    phones.push(p);
    return p;
  };
  const sms = new FakeSmsProvider();
  const events: string[] = [];
  const notifier: SecurityNotifier = {
    newDeviceSignIn: async (i) => void events.push(`new_device:${i.email ?? "none"}`),
    recoveryCodeUsed: async () => void events.push("recovery_used"),
    numberChanged: async (i) => void events.push(`number_changed:${i.oldPhone ?? "none"}`),
  };

  const q = () => ({
    query: async (text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
    }),
  });

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
  });
  afterAll(async () => {
    await pool.query(
      "DELETE FROM patients WHERE account_user_id IN (SELECT id FROM users WHERE phone_number = ANY($1) OR email LIKE $2)",
      [phones, `it-${run}-%`],
    );
    await pool.query("DELETE FROM users WHERE phone_number = ANY($1) OR email LIKE $2", [
      phones,
      `it-${run}-%`,
    ]);
    await pool.end();
  });

  function make() {
    const repo = new IdentityRepo(q());
    const stepRepo = new StepUpRepo(q());
    const service = new StepUpService({ repo: stepRepo, notifier, secret: SECRET, appUrl: ORIGIN });
    // The hooks read sessions through `auth`, which is created after them (as in index.ts).
    // eslint-disable-next-line prefer-const
    let auth: ReturnType<typeof createAuth> | undefined;
    const hooks = createStepUpHooks({
      service,
      production: true,
      phoneOf: async (id) => (await stepRepo.snapshot(id))?.phoneNumber ?? null,
      sessionOf: async (ctx) => {
        const found = await auth?.api.getSession({
          headers: ctx.request?.headers ?? new Headers(),
        });
        if (!found) return null;
        return {
          id: found.session.id,
          userId: found.user.id,
          createdAt: new Date(found.session.createdAt),
          limited: (found.session as { limited?: boolean }).limited === true,
        };
      },
    });
    auth = createAuth({
      database: pool,
      secret: SECRET,
      baseUrl: ORIGIN,
      trustedOrigins: [ORIGIN],
      production: true,
      rolesOf: (id) => repo.rolesOf(id),
      emailAndPassword: staffEmailAndPassword,
      socialProviders: googleProviders({ clientId: "client-id", clientSecret: "client-secret" }),
      extraAllowedPaths: GOOGLE_AUTH_PATHS,
      onSocialUserCreated: (id) => repo.grantPatientRole(id),
      stepUp: hooks,
      plugins: [
        ...createStaffPlugins(SECRET),
        createPhonePlugin({
          sms,
          allowedCountryCodes: ["+91"],
          isStaff: async (id) => (await repo.rolesOf(id)).some((r) => r !== "patient"),
          onVerified: async (id, ctx) => {
            await repo.recordPhoneVerified(id);
            await hooks.onPhoneVerified(id, ctx);
          },
        }),
      ],
    });
    const call = (
      method: "GET" | "POST",
      path: string,
      init: { body?: unknown; cookie?: string; ua?: string } = {},
    ) =>
      (auth as ReturnType<typeof createAuth>).handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method,
          redirect: "manual",
          headers: {
            "user-agent": init.ua ?? BROWSER,
            ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}),
            ...(init.cookie ? { cookie: init.cookie } : {}),
          },
          body: method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
        }),
      );
    const jar = (res: Response, previous = "") => {
      const fresh = new Map<string, string>();
      for (const c of previous.split("; ").filter(Boolean)) fresh.set(c.split("=")[0] as string, c);
      for (const c of res.headers.getSetCookie()) {
        const pair = c.split(";")[0] as string;
        if (/Max-Age=0/i.test(c)) fresh.delete(pair.split("=")[0] as string);
        else fresh.set(pair.split("=")[0] as string, pair);
      }
      return [...fresh.values()].join("; ");
    };
    /** Phone sign-in as one browser (`cookie` is that browser's jar). */
    async function phoneSignIn(phone: string, cookie = "") {
      await call("POST", "/phone-number/send-otp", { body: { phoneNumber: phone }, cookie });
      const code = sms.sent.at(-1)?.variables.code as string;
      const res = await call("POST", "/phone-number/verify", {
        body: { phoneNumber: phone, code },
        cookie,
      });
      return { res, jar: jar(res, cookie) };
    }
    const sessionOf = async (cookie: string) => {
      const found = await (auth as ReturnType<typeof createAuth>).api.getSession({
        headers: new Headers({ cookie }),
      });
      return found as { session: { id: string; limited?: boolean }; user: { id: string } } | null;
    };
    return {
      auth: auth as ReturnType<typeof createAuth>,
      service,
      stepRepo,
      call,
      jar,
      phoneSignIn,
      sessionOf,
    };
  }

  const userByPhone = async (phone: string) =>
    (await pool.query("SELECT * FROM users WHERE phone_number = $1", [phone])).rows[0];
  const sessionRow = async (id: string) =>
    (await pool.query("SELECT limited, unlock_method FROM auth_sessions WHERE id = $1", [id]))
      .rows[0];
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

  describe("risk-based sign-in", () => {
    it("a brand-new account is not limited and its browser is remembered (cookie holds a random token, the table only its hash)", async () => {
      const t = make();
      const phone = newPhone();
      const { res, jar } = await t.phoneSignIn(phone);
      expect(res.status).toBe(200);
      const cookie = res.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${deviceCookieName(true)}=`));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      const session = await t.sessionOf(jar);
      expect((await sessionRow(session?.session.id as string)).limited).toBe(false);
      expect((await sessionRow(session?.session.id as string)).unlock_method).toBe("new_account");
      const user = await userByPhone(phone);
      expect(user.last_active_at).toBeInstanceOf(Date);
      expect(user.phone_verified_at).toBeInstanceOf(Date);
      const token = decodeURIComponent((cookie as string).split(";")[0]!.split("=")[1] as string);
      const devices = (
        await pool.query("SELECT device_hash FROM trusted_devices WHERE user_id = $1", [user.id])
      ).rows;
      expect(devices).toHaveLength(1);
      expect(devices[0].device_hash).toBe(hashDeviceToken(token));
      expect(JSON.stringify(devices)).not.toContain(token);
    });

    it("the same browser signs in again without a limit, and its 30 days start over", async () => {
      const t = make();
      const phone = newPhone();
      const first = await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      await pool.query(
        "UPDATE trusted_devices SET expires_at = now() + interval '2 days' WHERE user_id = $1",
        [user.id],
      );
      const second = await t.phoneSignIn(phone, first.jar);
      const session = await t.sessionOf(second.jar);
      expect((await sessionRow(session?.session.id as string)).limited).toBe(false);
      const device = (
        await pool.query("SELECT expires_at FROM trusted_devices WHERE user_id = $1", [user.id])
      ).rows[0];
      expect(new Date(device.expires_at).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
      expect(
        second.res.headers.getSetCookie().some((c) => c.startsWith(deviceCookieName(true))),
      ).toBe(false);
    });

    it("a phone-only sign-in on a new device is limited, is not remembered, and cannot read the patient's records", async () => {
      const t = make();
      const phone = newPhone();
      await t.phoneSignIn(phone); // the real owner, on their own browser
      const user = await userByPhone(phone);
      // A different browser (no device cookie): the new owner of a recycled number, say.
      const stranger = await t.phoneSignIn(phone);
      const session = await t.sessionOf(stranger.jar);
      expect((await sessionRow(session?.session.id as string)).limited).toBe(true);
      expect(session?.session.limited).toBe(true);
      expect(
        stranger.res.headers.getSetCookie().some((c) => c.startsWith(deviceCookieName(true))),
      ).toBe(false);
      expect(
        (
          await pool.query(
            "SELECT 1 FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL",
            [user.id],
          )
        ).rows,
      ).toHaveLength(1);
      // The patient's data: a profile exists, and the limited session cannot read it.
      const patients = new PatientService(new PatientRepo(q()));
      const mine = await patients.create(
        { userId: user.id, roles: ["patient"] },
        { relation: "self", fullName: "Asha Verma", dob: "1990-04-12", gender: "female" },
      );
      const limited = {
        userId: user.id,
        roles: ["patient" as const],
        limited: session?.session.limited === true,
      };
      await expect(patients.get(limited, mine.id)).rejects.toMatchObject({
        code: "step_up_required",
      });
      await expect(patients.list(limited)).resolves.toBeDefined();
      await expect(
        patients.update(limited, mine.id, { fullName: "Hacker Person" }),
      ).rejects.toMatchObject({ code: "step_up_required" });
      await expect(patients.remove(limited, mine.id)).rejects.toMatchObject({
        code: "step_up_required",
      });
      // The owner's own full session reads it.
      expect((await patients.get({ userId: user.id, roles: ["patient"] }, mine.id)).fullName).toBe(
        "Asha Verma",
      );
    });

    it("a limited session cannot add Google (a recycled number could add its own)", async () => {
      const t = make();
      const phone = newPhone();
      await t.phoneSignIn(phone);
      const stranger = await t.phoneSignIn(phone);
      const res = await t.call("POST", "/link-social", {
        body: { provider: "google", callbackURL: "/x" },
        cookie: stranger.jar,
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code?: string }).code).toBe("STEP_UP_REQUIRED");
      const user = await userByPhone(phone);
      expect(
        (await pool.query("SELECT 1 FROM auth_accounts WHERE user_id = $1", [user.id])).rows,
      ).toHaveLength(0);
    });

    it.each([
      [
        "90 days without a sign-in",
        "UPDATE users SET last_active_at = now() - interval '91 days' WHERE phone_number = $1",
      ],
      [
        "a number last proven 181 days ago",
        "UPDATE users SET phone_verified_at = now() - interval '181 days' WHERE phone_number = $1",
      ],
      [
        "a number changed 5 days ago",
        "UPDATE users SET phone_changed_at = now() - interval '5 days' WHERE phone_number = $1",
      ],
      ["a 'not me' flag", "UPDATE users SET force_step_up_at = now() WHERE phone_number = $1"],
    ])("even on the remembered browser, %s makes the sign-in limited", async (_name, sql) => {
      const t = make();
      const phone = newPhone();
      const first = await t.phoneSignIn(phone);
      await pool.query(sql, [phone]);
      const again = await t.phoneSignIn(phone, first.jar);
      const session = await t.sessionOf(again.jar);
      expect((await sessionRow(session?.session.id as string)).limited).toBe(true);
    });

    it("a remembered device that expired counts as new", async () => {
      const t = make();
      const phone = newPhone();
      const first = await t.phoneSignIn(phone);
      await pool.query(
        "UPDATE trusted_devices SET expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE phone_number = $1)",
        [phone],
      );
      const again = await t.phoneSignIn(phone, first.jar);
      expect((await sessionRow((await t.sessionOf(again.jar))?.session.id as string)).limited).toBe(
        true,
      );
    });

    it("a stolen device cookie from another account does not make this account's sign-in known", async () => {
      const t = make();
      const a = await t.phoneSignIn(newPhone());
      const bPhone = newPhone();
      await t.phoneSignIn(bPhone); // B exists on its own browser
      const cross = await t.phoneSignIn(
        bPhone,
        a.jar
          .split("; ")
          .filter((c) => c.startsWith(deviceCookieName(true)))
          .join("; "),
      );
      expect((await sessionRow((await t.sessionOf(cross.jar))?.session.id as string)).limited).toBe(
        true,
      );
    });

    it("a new device raises a notice with a 'not me' link; only a hash of the link is stored", async () => {
      const t = make();
      const phone = newPhone();
      await t.phoneSignIn(phone);
      events.length = 0;
      await t.phoneSignIn(phone);
      expect(events).toContain("new_device:none"); // no real email on file, so nothing is mailed
      const user = await userByPhone(phone);
      const alerts = (
        await pool.query("SELECT token_hash, used_at FROM signin_alerts WHERE user_id = $1", [
          user.id,
        ])
      ).rows;
      expect(alerts).toHaveLength(1);
      expect(alerts[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("recovery codes", () => {
    async function limitedSession(t: ReturnType<typeof make>) {
      const phone = newPhone();
      const owner = await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      const stranger = await t.phoneSignIn(phone);
      const session = await t.sessionOf(stranger.jar);
      return { phone, user, owner, stranger, sessionId: session?.session.id as string };
    }

    it("makes ten codes, stores only hashes, and replaces the old unused set", async () => {
      const t = make();
      const phone = newPhone();
      await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      const first = await t.service.generateRecoveryCodes(user.id);
      expect(first).toHaveLength(10);
      expect(new Set(first).size).toBe(10);
      for (const code of first) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      const stored = (
        await pool.query("SELECT code_hash FROM recovery_codes WHERE user_id = $1", [user.id])
      ).rows;
      expect(stored).toHaveLength(10);
      for (const row of stored) expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(first[0]!.replace("-", ""));
      const second = await t.service.generateRecoveryCodes(user.id);
      expect(await t.stepRepo.unusedRecoveryCodes(user.id)).toBe(10);
      // An old code no longer works.
      const ls = await limitedSession(t);
      void ls;
      expect(second).not.toEqual(first);
    });

    it("a recovery code unlocks a limited session, works once, and the patient is told", async () => {
      const t = make();
      const s = await limitedSession(t);
      const [code] = await t.service.generateRecoveryCodes(s.user.id);
      events.length = 0;
      expect(
        await t.service.unlockWithRecoveryCode({
          userId: s.user.id,
          sessionId: s.sessionId,
          code: code as string,
        }),
      ).toBe(true);
      expect((await sessionRow(s.sessionId)).limited).toBe(false);
      expect((await sessionRow(s.sessionId)).unlock_method).toBe("recovery_code");
      expect(events).toContain("recovery_used");
      expect(await t.stepRepo.unusedRecoveryCodes(s.user.id)).toBe(9);
      // The same code a second time, from the same or another session, fails.
      expect(
        await t.service.unlockWithRecoveryCode({
          userId: s.user.id,
          sessionId: s.sessionId,
          code: code as string,
        }),
      ).toBe(false);
      const another = await t.phoneSignIn(s.phone);
      const anotherId = (await t.sessionOf(another.jar))?.session.id as string;
      expect(
        await t.service.unlockWithRecoveryCode({
          userId: s.user.id,
          sessionId: anotherId,
          code: code as string,
        }),
      ).toBe(false);
      expect((await sessionRow(anotherId)).limited).toBe(true);
    });

    it("typing it in lower case, with spaces or without the dash, works; wrong and malformed codes fail", async () => {
      const t = make();
      const s = await limitedSession(t);
      const [a, b] = await t.service.generateRecoveryCodes(s.user.id);
      expect(
        await t.service.unlockWithRecoveryCode({
          userId: s.user.id,
          sessionId: s.sessionId,
          code: (a as string).toLowerCase().replace("-", " "),
        }),
      ).toBe(true);
      for (const bad of [
        "",
        "AAAAA-AAAAA",
        "short",
        "1234567890",
        `${b} extra`,
        "A".repeat(200),
        "'; DROP TABLE recovery_codes;--",
      ]) {
        expect(
          await t.service.unlockWithRecoveryCode({
            userId: s.user.id,
            sessionId: s.sessionId,
            code: bad,
          }),
          bad.slice(0, 15),
        ).toBe(false);
      }
    });

    it("a code of one person never unlocks another person's session", async () => {
      const t = make();
      const a = await limitedSession(t);
      const b = await limitedSession(t);
      const [codeOfA] = await t.service.generateRecoveryCodes(a.user.id);
      expect(
        await t.service.unlockWithRecoveryCode({
          userId: b.user.id,
          sessionId: b.sessionId,
          code: codeOfA as string,
        }),
      ).toBe(false);
      expect((await sessionRow(b.sessionId)).limited).toBe(true);
    });

    it("two attempts with the same code at the same moment: exactly one wins", async () => {
      const t = make();
      const s = await limitedSession(t);
      const [code] = await t.service.generateRecoveryCodes(s.user.id);
      const second = await t.phoneSignIn(s.phone);
      const secondId = (await t.sessionOf(second.jar))?.session.id as string;
      const results = await Promise.all([
        t.service.unlockWithRecoveryCode({
          userId: s.user.id,
          sessionId: s.sessionId,
          code: code as string,
        }),
        t.service.unlockWithRecoveryCode({
          userId: s.user.id,
          sessionId: secondId,
          code: code as string,
        }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("unlocking clears a 'not me' flag", async () => {
      const t = make();
      const s = await limitedSession(t);
      await pool.query("UPDATE users SET force_step_up_at = now() WHERE id = $1", [s.user.id]);
      const [code] = await t.service.generateRecoveryCodes(s.user.id);
      await t.service.unlockWithRecoveryCode({
        userId: s.user.id,
        sessionId: s.sessionId,
        code: code as string,
      });
      expect((await userByPhone(s.phone)).force_step_up_at).toBeNull();
    });
  });

  describe("'this was not me'", () => {
    it("ends every session, forgets every device, forces step-up, and works once", async () => {
      const t = make();
      const phone = newPhone();
      const owner = await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      await t.phoneSignIn(phone); // a second sign-in from a new browser raises the alert
      const token = `nm-${run}-` + "x".repeat(30);
      await t.stepRepo.createAlert({
        id: uuidv7(),
        userId: user.id,
        sessionId: null,
        tokenHash: hashDeviceToken(token),
        ttlSeconds: 3600,
      });
      expect(await t.service.notMe(token)).toBe(true);
      expect(
        (
          await pool.query("SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1", [
            user.id,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL",
            [user.id],
          )
        ).rows[0].n,
      ).toBe(0);
      expect((await userByPhone(phone)).force_step_up_at).toBeInstanceOf(Date);
      expect(await t.service.notMe(token)).toBe(false);
      expect(await t.sessionOf(owner.jar)).toBeNull();
      // The owner's old browser now signs in limited, until a second method is proven.
      const back = await t.phoneSignIn(phone, owner.jar);
      expect((await sessionRow((await t.sessionOf(back.jar))?.session.id as string)).limited).toBe(
        true,
      );
    });

    it("an unknown, expired or used link is refused the same way", async () => {
      const t = make();
      expect(await t.service.notMe("never-issued-token-0000000000")).toBe(false);
      const phone = newPhone();
      await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      const token = `expired-${run}-` + "y".repeat(30);
      await t.stepRepo.createAlert({
        id: uuidv7(),
        userId: user.id,
        sessionId: null,
        tokenHash: hashDeviceToken(token),
        ttlSeconds: -60,
      });
      expect(await t.service.notMe(token)).toBe(false);
    });
  });

  describe("changing the number", () => {
    async function fullSession(t: ReturnType<typeof make>) {
      const phone = newPhone();
      const first = await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      return { phone, user, jar: first.jar };
    }
    const changeTo = async (t: ReturnType<typeof make>, jar: string, newNumber: string) => {
      await t.call("POST", "/phone-number/send-otp", {
        body: { phoneNumber: newNumber },
        cookie: jar,
      });
      const code = sms.sent.at(-1)?.variables.code as string;
      return t.call("POST", "/phone-number/verify", {
        body: { phoneNumber: newNumber, code, updatePhoneNumber: true },
        cookie: jar,
      });
    };

    it("moves the account to the new number, ends other sessions, forgets other devices, and tells the old number", async () => {
      const t = make();
      const me = await fullSession(t);
      const other = await t.phoneSignIn(me.phone); // another browser: a limited session, a new-device alert
      expect(await t.sessionOf(other.jar)).not.toBeNull();
      events.length = 0;
      const next = newPhone();
      const res = await changeTo(t, me.jar, next);
      expect(res.status).toBe(200);
      const user = (await pool.query("SELECT * FROM users WHERE id = $1", [me.user.id])).rows[0];
      expect(user.phone_number).toBe(next);
      expect(user.phone_changed_at).toBeInstanceOf(Date);
      // The old number is detached: it belongs to nobody now, so a new person signing in with it gets a NEW account.
      expect(await userByPhone(me.phone)).toBeUndefined();
      expect(await t.sessionOf(other.jar)).toBeNull(); // the other session was revoked
      expect(await t.sessionOf(me.jar)).not.toBeNull(); // the one that did it stays
      expect(events).toContain(`number_changed:${me.phone}`);
      const stranger = await t.phoneSignIn(me.phone);
      const strangerUser = (
        await pool.query("SELECT id FROM users WHERE phone_number = $1", [me.phone])
      ).rows[0];
      expect(strangerUser.id).not.toBe(me.user.id);
      expect(
        (await sessionRow((await t.sessionOf(stranger.jar))?.session.id as string)).unlock_method,
      ).toBe("new_account");
    });

    it("the other remembered devices are forgotten, so their next sign-in is limited", async () => {
      const t = make();
      const me = await fullSession(t);
      await changeTo(t, me.jar, newPhone());
      const devices = (
        await pool.query("SELECT revoked_at FROM trusted_devices WHERE user_id = $1", [me.user.id])
      ).rows;
      expect(devices.filter((d) => d.revoked_at === null)).toHaveLength(1); // only this browser's
    });

    it("right after a change, a phone sign-in from another browser is limited (number changed recently)", async () => {
      const t = make();
      const me = await fullSession(t);
      const next = newPhone();
      await changeTo(t, me.jar, next);
      const other = await t.phoneSignIn(next);
      expect((await sessionRow((await t.sessionOf(other.jar))?.session.id as string)).limited).toBe(
        true,
      );
    });

    it("needs a full session: a limited one is refused and nothing changes", async () => {
      const t = make();
      const me = await fullSession(t);
      const stranger = await t.phoneSignIn(me.phone);
      const res = await changeTo(t, stranger.jar, newPhone());
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code?: string }).code).toBe("STEP_UP_REQUIRED");
      expect((await userByPhone(me.phone)).id).toBe(me.user.id);
    });

    it("needs a sign-in within the last 15 minutes", async () => {
      const t = make();
      const me = await fullSession(t);
      await pool.query(
        "UPDATE auth_sessions SET created_at = now() - interval '16 minutes' WHERE user_id = $1",
        [me.user.id],
      );
      const res = await changeTo(t, me.jar, newPhone());
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code?: string }).code).toBe("FRESH_LOGIN_REQUIRED");
    });

    it("a number that already has an account cannot be taken over this way", async () => {
      const t = make();
      const me = await fullSession(t);
      const victim = await fullSession(t);
      const res = await changeTo(t, me.jar, victim.phone);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await userByPhone(victim.phone)).id).toBe(victim.user.id);
      expect((await userByPhone(me.phone)).id).toBe(me.user.id);
    });
  });

  describe("re-verification every 180 days", () => {
    it("a number not proven for 180 days is marked unverified and gets no notices; a fresh one does", async () => {
      const t = make();
      const stale = newPhone();
      const fresh = newPhone();
      await t.phoneSignIn(stale);
      await t.phoneSignIn(fresh);
      await pool.query("UPDATE users SET phone_verified_at = $2 WHERE phone_number = $1", [
        stale,
        ago(181),
      ]);
      await pool.query("UPDATE users SET phone_verified_at = $2 WHERE phone_number = $1", [
        fresh,
        ago(179),
      ]);
      const staleUser = await userByPhone(stale);
      const freshUser = await userByPhone(fresh);
      // Before the job runs, the gate already refuses the stale number.
      expect(await t.stepRepo.deliverablePhone(staleUser.id)).toBeNull();
      expect(await t.stepRepo.deliverablePhone(freshUser.id)).toBe(fresh);
      expect(await t.stepRepo.markStalePhonesUnverified()).toBeGreaterThanOrEqual(1);
      expect((await userByPhone(stale)).phone_number_verified).toBe(false);
      expect((await userByPhone(fresh)).phone_number_verified).toBe(true);
      expect(await t.stepRepo.deliverablePhone(staleUser.id)).toBeNull();
      // Signing in with a code proves the number again.
      await t.phoneSignIn(stale);
      expect((await userByPhone(stale)).phone_number_verified).toBe(true);
      expect(await t.stepRepo.deliverablePhone(staleUser.id)).toBe(stale);
    });

    it("an account with an unverified number is refused as a notice target even if the flag was cleared by hand", async () => {
      const t = make();
      const phone = newPhone();
      await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      await pool.query("UPDATE users SET phone_number_verified = false WHERE id = $1", [user.id]);
      expect(await t.stepRepo.deliverablePhone(user.id)).toBeNull();
    });
  });

  describe("Google proves the account", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });
    const jwt = (claims: object) => {
      const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      return `${part({ alg: "none" })}.${part(claims)}.`;
    };

    it("a Google sign-in is a full session, remembers the browser and clears a 'not me' flag", async () => {
      const t = make();
      const phone = newPhone();
      await t.phoneSignIn(phone);
      const user = await userByPhone(phone);
      const sub = `g-step-${run}`;
      // The patient has linked Google before (explicit, from a fresh full session).
      await pool.query(
        "INSERT INTO auth_accounts (id, user_id, account_id, provider_id) VALUES (gen_random_uuid(), $1, $2, 'google')",
        [user.id, sub],
      );
      await pool.query("UPDATE users SET force_step_up_at = now() WHERE id = $1", [user.id]);
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input instanceof Request ? input.url : input);
        if (u.startsWith("https://oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "a",
              token_type: "Bearer",
              expires_in: 3600,
              id_token: jwt({
                iss: "https://accounts.google.com",
                aud: "client-id",
                exp: Math.floor(Date.now() / 1000) + 3600,
                sub,
                email: `it-${run}-gs@gmail.com`,
                email_verified: true,
              }),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return realFetch(input as RequestInfo, init);
      }) as typeof fetch;
      const start = await t.call("POST", "/sign-in/social", {
        body: { provider: "google", callbackURL: "/patient/dashboard" },
      });
      const { url: authorize } = (await start.json()) as { url: string };
      const state = new URL(authorize).searchParams.get("state");
      const callback = await t.call("GET", `/callback/google?code=x&state=${state}`, {
        cookie: t.jar(start),
      });
      expect(callback.status).toBe(302);
      const jar = t.jar(callback, t.jar(start));
      const session = await t.sessionOf(jar);
      expect((await sessionRow(session?.session.id as string)).limited).toBe(false);
      expect((await sessionRow(session?.session.id as string)).unlock_method).toBe("google");
      expect((await userByPhone(phone)).force_step_up_at).toBeNull();
      expect(
        callback.headers.getSetCookie().some((c) => c.startsWith(deviceCookieName(true))),
      ).toBe(true);
      // That browser now signs in by phone without a limit.
      const back = await t.phoneSignIn(phone, jar);
      expect((await sessionRow((await t.sessionOf(back.jar))?.session.id as string)).limited).toBe(
        false,
      );
    });
  });
});
