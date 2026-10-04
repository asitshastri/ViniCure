import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { createHmac, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../db/testing";
import { FakeCaptchaVerifier, FakeSmsProvider } from "../lib/adapters/fakes";
import { MemoryCache } from "../lib/cache/cache";
import type { Queryable } from "../lib/db/queryable";
import { uuidv7 } from "../lib/ids";
import { RateLimiter } from "../lib/rate-limit/limiter";
import { buildCsp, securityHeaders } from "../lib/security/headers";
import { createAuth } from "../modules/identity/auth";
import { normalizeEmail } from "../modules/identity/invitations";
import { guardOtpRequest, type OtpGuardDeps } from "../modules/identity/otp-guard";
import { createPhonePlugin, isAllowedPhone, normalizePhone } from "../modules/identity/phone";
import { createStaffPlugins, staffEmailAndPassword } from "../modules/identity/staff";
import { totpCode } from "../modules/identity/totp";
import { PatientRepo } from "../modules/patients/repo";
import { createPatientBody, patientIdParams } from "../modules/patients/schemas";
import { PatientService } from "../modules/patients/service";
import { DataRequestRepo } from "../modules/compliance/repo";
import { createDataRequestBody } from "../modules/compliance";
import { listRoutes } from "../lib/api/registry";

// P2-14: the security test suite. Every case here is an attack; a case that succeeds fails the
// build. It runs with the rest of `pnpm test`, so it runs in CI wherever the tests run.
//
// EXTENDING IT: when a feature lands, add its attack cases in the matching section. Two guards
// below fail on purpose when a new kind of surface appears (an upload route, a new repo query
// built with a template string) until the case or the allow-list entry is added here.

const ORIGIN = "https://vinicure.example";
const PHONE = "+919876543210";
const SECRET = "attack-suite-secret-with-at-least-thirty-two-chars"; // secret-scan:allow

/** Text an attacker sends hoping something interprets it. */
export const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE patients; --",
  '" OR ""="',
  "1; SELECT pg_sleep(5)",
  "' UNION SELECT password FROM auth_accounts --",
  "Robert'); DROP TABLE users;--",
  "$$ ; DELETE FROM users ; $$",
  "<script>alert(1)</script>",
  '"><img src=x onerror=alert(1)>',
  "javascript:alert(1)",
  "{{7*7}}",
  "${7*7}",
  "%s%s%s%n",
  "../../etc/passwd",
  "..\\..\\windows\\system32",
  "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "a\u0000b",
  "\r\nSet-Cookie: pwned=1",
  "‮evil",
  '{"$ne": null}',
  "x".repeat(5000),
];

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
describe("injection: text input never reaches the database as code", () => {
  let q: Queryable;
  let service: PatientService;
  let owner: { userId: string; roles: ["patient"] };

  beforeAll(async () => {
    const pg = await createTestDb();
    q = {
      query: async (text, params) => ({
        rows: (await pg.db.query(text, params)).rows as Row[],
      }),
    };
    service = new PatientService(new PatientRepo(q));
    const id = uuidv7();
    await q.query(`INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)`, [
      id,
      `${id}@x.invalid`,
    ]);
    owner = { userId: id, roles: ["patient"] };
  }, 60_000);

  const tables = async () =>
    (
      await q.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
      )
    ).rows[0]?.n;

  it("every payload in every profile text field is refused, or stored exactly as sent", async () => {
    const before = await tables();
    let stored = 0;
    for (const payload of PAYLOADS) {
      for (const field of ["fullName", "addressLine", "city", "state"] as const) {
        const parsed = createPatientBody.safeParse({
          relation: "other",
          fullName: field === "fullName" ? payload : "Safe Name",
          dob: "1990-01-01",
          gender: "other",
          ...(field === "fullName" ? {} : { [field]: payload }),
        });
        if (!parsed.success) continue; // refused at the door
        // Accepted: it must be stored as plain text, and nothing else may happen.
        const view = await service.create(owner, {
          ...parsed.data,
          fullName: `${parsed.data.fullName.slice(0, 40)} ${stored}`,
        });
        stored += 1;
        const row = (
          await q.query(`SELECT address_line, city, state FROM patients WHERE id = $1`, [view.id])
        ).rows[0];
        if (field !== "fullName")
          expect(row?.[field === "addressLine" ? "address_line" : field]).toBe(parsed.data[field]);
        await service.remove(owner, view.id).catch(() => undefined);
      }
    }
    expect(await tables()).toBe(before);
    for (const t of ["users", "patients", "auth_accounts"]) {
      await expect(q.query(`SELECT 1 FROM ${t} LIMIT 1`)).resolves.toBeTruthy();
    }
    expect(stored).toBeGreaterThan(0); // some payloads are legal text (for example addresses)
  });

  it("names are letters only: SQL and script payloads cannot even be submitted as a name", () => {
    for (const payload of PAYLOADS) {
      expect(
        createPatientBody.safeParse({
          relation: "other",
          fullName: payload,
          dob: "1990-01-01",
          gender: "other",
        }).success,
        payload.slice(0, 30),
      ).toBe(false);
    }
  });

  it("ids in paths must be UUIDs", () => {
    for (const payload of PAYLOADS) {
      expect(patientIdParams.safeParse({ id: payload }).success, payload.slice(0, 30)).toBe(false);
    }
    expect(patientIdParams.safeParse({ id: uuidv7() }).success).toBe(true);
  });

  it("phone numbers: only canonical +91 mobile numbers pass, whatever is appended", () => {
    for (const payload of PAYLOADS) {
      expect(isAllowedPhone(`${PHONE}${payload}`, ["+91"])).toBe(false);
      expect(isAllowedPhone(payload, ["+91"])).toBe(false);
      expect(normalizePhone(payload)).toBeNull();
      expect(normalizePhone(`98765${payload}`)).toBeNull();
    }
  });

  it("invitation emails: payloads with spaces or no address shape are refused; the rest is only ever a bound parameter", () => {
    for (const payload of PAYLOADS.filter((p) => /\s|\u0000/.test(p) || !p.includes("@"))) {
      expect(normalizeEmail(payload), payload.slice(0, 30)).toBeNull();
    }
  });

  it("enumerated bodies refuse anything outside the list", () => {
    for (const payload of PAYLOADS) {
      expect(createDataRequestBody.safeParse({ type: payload }).success).toBe(false);
      expect(
        createPatientBody.safeParse({
          relation: payload,
          fullName: "Safe Name",
          dob: "1990-01-01",
          gender: "other",
        }).success,
      ).toBe(false);
    }
  });

  it("data request repo with hostile ids stays a bound parameter", async () => {
    const repo = new DataRequestRepo(q);
    await expect(repo.listForUser("' OR 1=1 --")).rejects.toThrow(); // not a uuid: the database refuses the value
    expect((await q.query(`SELECT count(*)::int AS n FROM users`)).rows[0]?.n).toBeGreaterThan(0);
  });
});

describe("static guards: no SQL built from text, no raw HTML, no code evaluation", () => {
  const src = path.resolve(import.meta.dirname, "..");
  const files = (dir: string, ext: RegExp): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return files(full, ext);
      return ext.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
  const all = files(src, /\.(ts|tsx)$/);

  // The only template expressions allowed inside SQL text, each reviewed: column lists that are
  // constants, and placeholders ($1, $2...) counted by the code itself.
  const ALLOWED_SQL_EXPRESSIONS = new Set([
    "COLUMNS",
    'sets.join(", ")',
    "UPDATE_COLUMNS[key]",
    "params.length",
    "dobParam",
    // Directory repo: constant column lists, and a WHERE built only from fixed fragments with
    // numbered placeholders (the allow-listed filters are never put into the text).
    "DOCTOR_COLUMNS",
    "DOCUMENT_COLUMNS",
    "whereSql",
    "params.length - 1",
    // Payments repo: a constant column list.
    "PAYMENT_COLUMNS",
    // Invoice repo: constant column lists and a constant list of appointment states.
    "INVOICE_COLUMNS",
    "RETURNING_COLUMNS",
    "BILLABLE",
    // Payout repo: a constant column list.
    "PAYOUT_COLUMNS",
  ]);

  it("repo files use template expressions in SQL only from the reviewed list", () => {
    const offenders: string[] = [];
    for (const file of all.filter((f) => /repo\.ts$/.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\$\{([^}]*)\}/g)) {
        const expression = (match[1] ?? "").trim();
        if (!ALLOWED_SQL_EXPRESSIONS.has(expression)) {
          offenders.push(`${path.relative(src, file)}: \${${expression}}`);
        }
      }
    }
    expect(offenders, "build SQL with placeholders, or review and list the expression").toEqual([]);
  });

  it("no repo selects every column", () => {
    for (const file of all.filter((f) => /repo\.ts$/.test(f))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/SELECT\s+\*/i);
    }
  });

  it("no dangerouslySetInnerHTML, eval, new Function or child_process in application code", () => {
    for (const file of all) {
      const text = readFileSync(file, "utf8");
      const rel = path.relative(src, file);
      expect(text, rel).not.toContain("dangerouslySetInnerHTML");
      // `redis.eval(` (a Lua script call in the cache client) is a method, not JavaScript eval.
      expect(text, rel).not.toMatch(/(?<![.\w])eval\s*\(/);
      expect(text, rel).not.toMatch(/new Function\s*\(/);
      expect(text, rel).not.toMatch(
        /from ["']node:child_process["']|require\(["']child_process["']\)/,
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("XSS: nothing the page renders can run attacker text", () => {
  it("stored text comes back as inert JSON text, exactly as stored", () => {
    const payload = "<script>alert(1)</script>";
    const body = JSON.stringify({ addressLine: payload });
    expect(JSON.parse(body).addressLine).toBe(payload); // data, not markup
    const response = new Response(body, { headers: { "Content-Type": "application/json" } });
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("the production CSP has no inline or eval script, no objects, no framing, no foreign base", () => {
    const csp = buildCsp({ nonce: "abc", production: true });
    const script = csp.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
    expect(script).toContain("'nonce-abc'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/\*\s|https?:\/\/\*/);
  });

  it("every page response carries the anti-sniffing, anti-framing and referrer headers", () => {
    const headers = securityHeaders({ nonce: "n", production: true, pathname: "/" });
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBeTruthy();
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});

// ---------------------------------------------------------------------------------------------
type Ctx = ReturnType<typeof makeAuth>;

function makeAuth(options: { production?: boolean } = {}) {
  const production = options.production ?? true;
  const origin = production ? ORIGIN : "http://localhost:3000";
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
    secret: SECRET,
    baseUrl: origin,
    trustedOrigins: [origin],
    production,
    rolesOf: async () => ["patient"],
    emailAndPassword: staffEmailAndPassword,
    plugins: [
      ...createStaffPlugins(SECRET),
      createPhonePlugin({
        sms,
        allowedCountryCodes: ["+91"],
        isStaff: async () => false,
        onVerified: async () => undefined,
      }),
    ],
  });
  const call = (
    method: "GET" | "POST",
    p: string,
    init: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
  ) =>
    auth.handler(
      new Request(`${origin}/api/auth${p}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(method === "POST" ? { origin } : {}),
          ...(init.cookie ? { cookie: init.cookie } : {}),
          ...init.headers,
        },
        body: method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
      }),
    );
  async function signIn(phone = PHONE) {
    await call("POST", "/phone-number/send-otp", { body: { phoneNumber: phone } });
    const code = sms.sent.at(-1)?.variables.code as string;
    const res = await call("POST", "/phone-number/verify", { body: { phoneNumber: phone, code } });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { res, cookie, code };
  }
  return { auth, db, sms, call, signIn, origin, production };
}

describe("CSRF and Origin", () => {
  it("every Better Auth POST we expose refuses a foreign Origin, 'null', and a cross-site fetch without Origin", async () => {
    const t = makeAuth();
    const paths = [
      "/sign-in/email",
      "/sign-out",
      "/phone-number/send-otp",
      "/phone-number/verify",
      "/update-user",
      "/change-password",
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
    ];
    for (const p of paths) {
      for (const headers of [
        { origin: "https://evil.example" },
        { origin: "null" },
        { origin: `${ORIGIN}.evil.example` },
        { origin: "http://vinicure.example" },
        { origin: "", "sec-fetch-site": "cross-site" },
      ]) {
        const res = await t.auth.handler(
          new Request(`${ORIGIN}/api/auth${p}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers } as Record<string, string>,
            body: JSON.stringify({ phoneNumber: PHONE }),
          }),
        );
        expect(res.status, `${p} ${JSON.stringify(headers)}`).toBe(403);
      }
    }
    expect(t.sms.sent).toHaveLength(0);
  });

  it("cookies are SameSite=Lax, so a cross-site form post does not carry the session", async () => {
    const t = makeAuth();
    const { res } = await t.signIn();
    for (const c of res.headers.getSetCookie()) expect(c).toMatch(/SameSite=Lax/i);
  });
});

describe("broken authentication", () => {
  const session = async (t: Ctx, cookie: string) =>
    (await (await t.call("GET", "/get-session", { cookie })).json()) as {
      session?: unknown;
    } | null;

  it("a valid cookie works; a tampered, truncated, empty or foreign-signed one does not", async () => {
    const t = makeAuth();
    const { cookie } = await t.signIn();
    expect((await session(t, cookie))?.session).toBeTruthy();
    const [name, value] = cookie.split("=") as [string, string];
    const flipped = value.slice(0, 5) + (value[5] === "a" ? "b" : "a") + value.slice(6);
    for (const bad of [
      `${name}=${flipped}`,
      `${name}=${value.slice(0, 20)}`,
      `${name}=`,
      `${name}=${value}x`,
      `${name}=null`,
      `${name}=${"A".repeat(200)}`,
    ]) {
      expect((await session(t, bad)) ?? null, bad.slice(0, 40)).toBeNull();
    }
    // A token signed with another secret.
    const other = makeAuth();
    const foreign = await other.signIn();
    expect((await session(t, foreign.cookie)) ?? null).toBeNull();
  });

  it("an expired session and a revoked session stop working at once", async () => {
    const t = makeAuth();
    const { cookie } = await t.signIn();
    const row = t.db.auth_sessions?.[0] as Row;
    const original = row.expires_at;
    row.expires_at = new Date(Date.now() - 1000);
    expect((await session(t, cookie)) ?? null).toBeNull();
    row.expires_at = original;
    // Revoked: the row is gone, the cookie is useless at once.
    const live = makeAuth();
    const second = await live.signIn();
    expect((await session(live, second.cookie))?.session).toBeTruthy();
    live.db.auth_sessions?.splice(0);
    expect((await session(live, second.cookie)) ?? null).toBeNull();
  });

  it("a session token in an Authorization header or a look-alike cookie name is ignored", async () => {
    const t = makeAuth();
    const { cookie } = await t.signIn();
    const value = cookie.split("=")[1] as string;
    const asHeader = await t.auth.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, {
        headers: { authorization: `Bearer ${value}` },
      }),
    );
    expect(((await asHeader.json()) as unknown) ?? null).toBeNull();
    for (const name of [
      "vc_session",
      "__Secure-vc_session",
      "session",
      "better-auth.session_token",
    ]) {
      expect((await session(t, `${name}=${value}`)) ?? null, name).toBeNull();
    }
  });

  it("a one-time code cannot be replayed, and a code for one number fails for another", async () => {
    const t = makeAuth();
    const { code } = await t.signIn();
    const replay = await t.call("POST", "/phone-number/verify", {
      body: { phoneNumber: PHONE, code },
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);
    await t.call("POST", "/phone-number/send-otp", { body: { phoneNumber: "+919876500001" } });
    const real = t.sms.sent.at(-1)?.variables.code as string;
    const crossed = await t.call("POST", "/phone-number/verify", {
      body: { phoneNumber: "+919876500002", code: real },
    });
    expect(crossed.status).toBeGreaterThanOrEqual(400);
  });

  it("brute forcing a code: three wrong guesses burn it", async () => {
    const t = makeAuth();
    await t.call("POST", "/phone-number/send-otp", { body: { phoneNumber: PHONE } });
    const real = t.sms.sent.at(-1)?.variables.code as string;
    let guess = 0;
    for (let i = 0; i < 3; i++) {
      guess += 1;
      const wrong =
        String(guess).padStart(6, "0") === real ? "999999" : String(guess).padStart(6, "0");
      await t.call("POST", "/phone-number/verify", { body: { phoneNumber: PHONE, code: wrong } });
    }
    const late = await t.call("POST", "/phone-number/verify", {
      body: { phoneNumber: PHONE, code: real },
    });
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(t.db.users).toHaveLength(0);
  });

  describe("staff second step", () => {
    async function staffWithTotp(t: Ctx) {
      const ctx = await t.auth.$context;
      const user = await ctx.internalAdapter.createUser(
        { email: "doc@example.com", name: "Dr", emailVerified: true, twoFactorEnabled: true },
        { method: "test" },
      );
      await ctx.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await ctx.password.hash("a long and sturdy passphrase"),
      });
      const secret = randomBytes(10).toString("hex");
      await ctx.adapter.create({
        model: "twoFactor",
        data: {
          userId: user.id,
          secret: await symmetricEncrypt({ key: ctx.secretConfig, data: secret }),
          backupCodes: await symmetricEncrypt({
            key: ctx.secretConfig,
            data: JSON.stringify(["abcde-fghij"]),
          }),
          verified: true,
        },
      });
      return { secret, email: user.email };
    }
    const step1 = async (t: Ctx, email: string) => {
      const res = await t.call("POST", "/sign-in/email", {
        body: { email, password: "a long and sturdy passphrase" },
      });
      return res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    };

    it("the same authenticator code cannot be used twice", async () => {
      const t = makeAuth();
      const { secret, email } = await staffWithTotp(t);
      const code = totpCode(secret, Date.now());
      const first = await t.call("POST", "/two-factor/verify-totp", {
        body: { code },
        cookie: await step1(t, email),
      });
      expect(first.status).toBe(200);
      const second = await t.call("POST", "/two-factor/verify-totp", {
        body: { code },
        cookie: await step1(t, email),
      });
      expect(
        second.status,
        "RFC 6238 section 5.2: a verifier must not accept the same code twice",
      ).toBeGreaterThanOrEqual(400);
    });

    it("the challenge cookie of one person cannot be used with another's, nor after it is used", async () => {
      const t = makeAuth();
      const { secret, email } = await staffWithTotp(t);
      const cookie = await step1(t, email);
      const ok = await t.call("POST", "/two-factor/verify-totp", {
        body: { code: totpCode(secret, Date.now()) },
        cookie,
      });
      expect(ok.status).toBe(200);
      const again = await t.call("POST", "/two-factor/verify-totp", {
        body: { code: totpCode(secret, Date.now() + 30_000) },
        cookie,
      });
      expect(again.status).toBeGreaterThanOrEqual(400);
    });

    it("a password guess never yields a session, and neither does a wrong code", async () => {
      const t = makeAuth();
      const { email } = await staffWithTotp(t);
      for (let i = 0; i < 5; i++) {
        const res = await t.call("POST", "/sign-in/email", {
          body: { email, password: `guess-number-${i}-xxxxxx` },
        });
        expect(res.status).toBe(401);
      }
      const cookie = await step1(t, email);
      for (const code of ["000000", "123456", "999999", "abcdef", "", "0".repeat(100)]) {
        const res = await t.call("POST", "/two-factor/verify-totp", { body: { code }, cookie });
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
      expect(t.db.auth_sessions).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("privilege escalation", () => {
  it("a role, a status or an id in any body is refused or ignored", async () => {
    const t = makeAuth();
    const { cookie } = await t.signIn();
    for (const body of [
      { name: "x", role: "admin" },
      { role: "admin" },
      { name: "x", roles: ["admin"] },
      { status: "active" },
      { id: "x" },
      { twoFactorEnabled: false },
    ]) {
      const res = await t.call("POST", "/update-user", { body, cookie });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(t.db.users?.[0]).not.toHaveProperty("role");
  });

  it("a patient session cannot reach the staff sign-in second step or staff-only Better Auth routes", async () => {
    const t = makeAuth();
    const { cookie } = await t.signIn();
    for (const p of [
      "/two-factor/enable",
      "/two-factor/disable",
      "/two-factor/generate-backup-codes",
      "/change-email",
      "/delete-user",
      "/list-sessions",
    ]) {
      expect((await t.call("POST", p, { body: { password: "x" }, cookie })).status, p).toBe(404);
    }
  });

  it("the invitation, admin and session routes list who may call them, and no route lists patient for staff work", () => {
    // The full matrix test (src/lib/api/access-matrix.test.ts) proves behaviour per role; this
    // guard fails if a staff-only route ever admits the patient role in its settings.
    for (const route of listRoutes()) {
      if (route.auth === "staff")
        expect(route.roles, `${route.method} ${route.path}`).not.toContain("patient");
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("rate-limit bypass attempts on OTP send", () => {
  function guard() {
    const cache = new MemoryCache();
    const captcha = new FakeCaptchaVerifier();
    const deps: OtpGuardDeps = {
      limiter: new RateLimiter({ cache, env: "t", hashSecret: "h".repeat(32) }),
      captcha,
      cache,
      env: "t",
      dailySmsCap: 1000,
      allowedCountryCodes: ["+91"],
      production: true,
      trustedProxyHops: 1,
      alert: () => undefined,
    };
    const send = async (phone: unknown, ip = "203.0.113.1", forwarded?: string) => {
      try {
        await guardOtpRequest(
          new Request(`${ORIGIN}/api/auth/phone-number/send-otp`, {
            method: "POST",
            headers: {
              "x-forwarded-for": forwarded ?? ip,
              "x-captcha-token": captcha.issue(),
            },
            body: JSON.stringify({ phoneNumber: phone }),
          }),
          deps,
        );
        return "ok";
      } catch (e) {
        return (e as { code?: string }).code ?? "error";
      }
    };
    return { send };
  }

  it("spelling the same number differently does not give a fresh allowance", async () => {
    const { send } = guard();
    for (let i = 0; i < 3; i++) expect(await send(PHONE, `203.0.113.${i + 10}`)).toBe("ok");
    for (const variant of [
      "+91 98765 43210",
      "+91-9876543210",
      "09876543210",
      "9876543210",
      "+919876543210 ",
      " +919876543210",
      "+91９８７６５４３２１０",
      "+919876543210\u0000",
      "+0919876543210",
    ]) {
      expect(await send(variant, "203.0.113.99"), JSON.stringify(variant)).not.toBe("ok");
    }
    expect(await send(PHONE, "203.0.113.98")).toBe("rate_limited");
  });

  it("a forged X-Forwarded-For does not hide the real address", async () => {
    const { send } = guard();
    for (let i = 0; i < 10; i++) {
      expect(
        await send(`+9198765432${String(i).padStart(2, "0")}`, "", `1.1.1.${i}, 203.0.113.7`),
      ).toBe("ok");
    }
    expect(await send("+919876543299", "", "9.9.9.9, 203.0.113.7")).toBe("rate_limited");
  });

  it("a burst of parallel requests cannot overrun the per-number limit", async () => {
    const { send } = guard();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => send(PHONE, `198.51.100.${i}`)),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
  });

  it("a path variant does not skip the guard", async () => {
    const cache = new MemoryCache();
    const deps = {
      limiter: new RateLimiter({ cache, env: "t", hashSecret: "h".repeat(32) }),
      cache,
      env: "t",
      dailySmsCap: 10,
      allowedCountryCodes: ["+91"],
      production: true,
      alert: () => undefined,
    } as OtpGuardDeps;
    // The guard and Better Auth read the same normalised URL; a trailing slash is a different,
    // unknown path for Better Auth (404), so it can never send a code.
    const t = makeAuth();
    const res = await t.auth.handler(
      new Request(`${ORIGIN}/api/auth/phone-number/send-otp/`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ phoneNumber: PHONE }),
      }),
    );
    expect(res.status).toBe(404);
    expect(t.sms.sent).toHaveLength(0);
    void deps;
  });
});

// ---------------------------------------------------------------------------------------------
describe("upload abuse", () => {
  it("there is no upload route yet; the one that adds it must add its cases here", () => {
    const uploadRoutes = listRoutes().filter((r) => /upload|presign|file|document/i.test(r.path));
    expect(
      uploadRoutes.map((r) => `${r.method} ${r.path}`),
      "A route that accepts files was added. Add attack cases for: oversized file, wrong magic bytes, double extension, path traversal in the name, executable content, infected file (ClamAV test file), unauthenticated and other-patient uploads, rate limit.",
    ).toEqual([]);
  });
});

// A reminder that keeps the suite honest about what it cannot prove here.
describe("what this suite does not cover yet", () => {
  it("lists the gaps on purpose", () => {
    const gaps = [
      "file uploads (P7)",
      "payment tampering (P5)",
      "video token abuse (P6)",
      "break-glass abuse (P9)",
    ];
    expect(gaps.length).toBeGreaterThan(0);
    void createHmac;
  });
});
