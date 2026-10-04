import pg from "pg";
import { expect, type Page } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { FakeEmailProvider } from "../src/lib/adapters/fakes";
import { createAuth } from "../src/modules/identity/auth";
import { invitationCrypto } from "../src/modules/identity/invitation-crypto";
import { InvitationService, hashToken } from "../src/modules/identity/invitations";
import { IdentityRepo } from "../src/modules/identity/repo";
import { createStaffPlugins, staffEmailAndPassword } from "../src/modules/identity/staff";
import { totpCode } from "../src/modules/identity/totp";

// Test-side access to the same database the app uses: read the OTP the app stored, make staff
// accounts the way invitations do, and compute authenticator codes. Nothing here is reachable
// from the browser.

export const PASSWORD = "Correct-Horse-Battery-9!";
export const run = Date.now();

let pool: pg.Pool | undefined;
export const db = () => (pool ??= new pg.Pool({ connectionString: E2E_ENV.DATABASE_URL, max: 3 }));
export const closeDb = async () => {
  await pool?.end();
  pool = undefined;
};

const queryable = () => ({
  query: async (text: string, params?: unknown[]) => ({
    rows: (await db().query(text, params)).rows as Record<string, unknown>[],
  }),
});

function auth() {
  const repo = new IdentityRepo(queryable());
  return createAuth({
    database: db(),
    secret: E2E_ENV.AUTH_SECRET,
    baseUrl: E2E_ENV.APP_URL,
    trustedOrigins: [E2E_ENV.APP_URL],
    production: false,
    rolesOf: (id) => repo.rolesOf(id),
    emailAndPassword: staffEmailAndPassword,
    plugins: createStaffPlugins(),
  });
}

/** A phone number no other run used. */
export function newPhone(): string {
  return `9${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9)}`;
}

/** The six digit code the app stored for this number (the fake SMS provider sends nothing). */
export async function otpFor(tenDigits: string): Promise<string> {
  const { rows } = await db().query(
    "SELECT value FROM auth_verifications WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1",
    [`+91${tenDigits}`],
  );
  expect(rows[0], "the app should have stored a code").toBeTruthy();
  return String(rows[0].value).split(":")[0] as string;
}

export async function typeCode(page: Page, code: string, label = "Digit 1 of 6") {
  await page.getByLabel(label).fill(code);
}

export type Staff = { email: string; secret: string; backupCodes: string[]; userId: string };

async function ensureAdmin(): Promise<string> {
  const email = `e2e-${run}-admin@example.com`;
  await db().query(
    "INSERT INTO users (id, name, email) VALUES (gen_random_uuid(), 'E2E Admin', $1) ON CONFLICT DO NOTHING",
    [email],
  );
  return String((await db().query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id);
}

/** Creates an invitation and returns the link token, as the email would carry it. */
export async function createInvitation(
  address: string,
  role: "doctor" | "admin" | "support" = "doctor",
) {
  const a = auth();
  const repo = new IdentityRepo(queryable());
  const mail = new FakeEmailProvider();
  const service = new InvitationService({
    repo,
    email: mail,
    crypto: invitationCrypto(a),
    appUrl: E2E_ENV.APP_URL,
  });
  await service.create({
    email: address,
    role,
    invitedBy: await ensureAdmin(),
    inviterRoles: ["admin", "super_admin"],
  });
  const token = (mail.sent.at(-1)?.variables.link as string).split("/invite/")[1] as string;
  return { token, service, auth: a, repo };
}

/** The authenticator secret the app generated for an invitation that has been enrolled. */
export async function pendingSecret(token: string): Promise<string> {
  const a = auth();
  const inv = await new IdentityRepo(queryable()).openInvitation(hashToken(token));
  return invitationCrypto(a).unseal(inv?.pendingTotpSecret as string);
}

/** A complete staff account: verified email, password, authenticator and backup codes. */
export async function createStaff(
  name: string,
  role: "doctor" | "admin" | "support" = "doctor",
): Promise<Staff> {
  const email = `e2e-${run}-${name}@example.com`;
  const { token, service } = await createInvitation(email, role);
  const enrol = await service.enrol(token);
  const secret = await pendingSecret(token);
  const made = await service.accept({
    token,
    name: "E2E Staff",
    password: PASSWORD,
    code: totpCode(secret, Date.now()),
  });
  return { email, secret, backupCodes: enrol.backupCodes, userId: made.userId };
}

export const codeNow = (secret: string) => totpCode(secret, Date.now());

export async function sessionCount(userId: string): Promise<number> {
  const { rows } = await db().query(
    "SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1",
    [userId],
  );
  return rows[0].n as number;
}

export async function cleanup() {
  const like = `e2e-${run}-%`;
  await db().query("DELETE FROM invitations WHERE email LIKE $1", [like]);
  await db().query(
    "DELETE FROM user_roles WHERE granted_by IN (SELECT id FROM users WHERE email LIKE $1)",
    [like],
  );
  await db().query(
    "DELETE FROM data_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1 OR phone_number LIKE '+919%')",
    [like],
  );
  await db().query(
    "DELETE FROM patients WHERE account_user_id IN (SELECT id FROM users WHERE email LIKE $1 OR phone_number LIKE '+919%')",
    [like],
  );
  await db().query("DELETE FROM users WHERE email LIKE $1", [like]);
}
