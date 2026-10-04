import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { FakeEmailProvider } from "../lib/adapters/fakes";
import { uuidv7 } from "../lib/ids";
import { createAuth } from "../modules/identity/auth";
import { invitationCrypto } from "../modules/identity/invitation-crypto";
import { InvitationService, hashToken } from "../modules/identity/invitations";
import { IdentityRepo } from "../modules/identity/repo";
import { createStaffPlugins, staffEmailAndPassword } from "../modules/identity/staff";
import { totpCode } from "../modules/identity/totp";
import { demoDoctors } from "./seed.mts";

// Test accounts for working on your own computer (never production): an admin, a support person,
// three doctors who can sign in (attached to demo doctors with working hours), and three patients
// with a few bookings, so every screen can be tried by hand with real sessions.
//
//   pnpm db:seed --demo --accounts
//
// Staff sign in with email, the password below, and an authenticator code. The authenticator
// secrets are made fresh on first run and written to `.dev-accounts.json` (ignored by git);
// `pnpm dev:code admin` prints the current code. Patients sign in with their phone number: the
// one-time code appears in the terminal that runs `pnpm dev` (a local-only convenience).

/** Local only. The same for every test account. */
export const DEV_PASSWORD = "Demo-Pass-Local-9!x"; // secret-scan:allow
export const DEV_FILE = ".dev-accounts.json";

type StaffSpec = { key: string; email: string; name: string; role: "admin" | "support" | "doctor" };
export const STAFF: StaffSpec[] = [
  { key: "admin", email: "admin@vinicure.test", name: "Demo Admin", role: "admin" },
  { key: "support", email: "support@vinicure.test", name: "Demo Support", role: "support" },
  { key: "doctor1", email: "doctor1@vinicure.test", name: "Dr Demo One", role: "doctor" },
  { key: "doctor2", email: "doctor2@vinicure.test", name: "Dr Demo Two", role: "doctor" },
  { key: "doctor3", email: "doctor3@vinicure.test", name: "Dr Demo Three", role: "doctor" },
];

type PatientSpec = { key: string; phone: string; name: string; dob: string; gender: string };
export const PATIENTS: PatientSpec[] = [
  {
    key: "patient1",
    phone: "+916000000001",
    name: "Asha Patient",
    dob: "1990-04-12",
    gender: "female",
  },
  {
    key: "patient2",
    phone: "+916000000002",
    name: "Ravi Patient",
    dob: "1985-09-30",
    gender: "male",
  },
  {
    key: "patient3",
    phone: "+916000000003",
    name: "Neel Patient",
    dob: "1978-01-05",
    gender: "male",
  },
];

type Row = Record<string, unknown>;

export async function seedAccounts(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production" || (env.APP_ENV ?? "local") !== "local") {
    throw new Error("Test accounts are for a local computer only.");
  }
  const secret = env.AUTH_SECRET;
  const url = env.DATABASE_URL;
  if (!secret || !url) throw new Error("AUTH_SECRET and DATABASE_URL must be set (.env.local)");
  const appUrl = env.APP_URL ?? "http://localhost:3000";

  const pool = new pg.Pool({ connectionString: url, max: 3 });
  const db = {
    query: async (text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as Row[],
    }),
  };
  const repo = new IdentityRepo(db);
  const auth = createAuth({
    database: pool,
    secret,
    baseUrl: appUrl,
    trustedOrigins: [appUrl],
    production: false,
    rolesOf: (id) => repo.rolesOf(id),
    emailAndPassword: staffEmailAndPassword,
    plugins: createStaffPlugins(secret),
  });
  const crypto = invitationCrypto(auth);
  const secrets: Record<string, { email?: string; phone?: string; totpSecret?: string }> = {};

  try {
    // Someone has to be the inviter on the record. It is not a login.
    await db.query(
      "INSERT INTO users (id, name, email) VALUES ($1, 'Demo Setup', 'setup@no-email.invalid') ON CONFLICT DO NOTHING",
      [uuidv7()],
    );
    const setupId = String(
      (await db.query("SELECT id FROM users WHERE email = 'setup@no-email.invalid'")).rows[0]?.id,
    );

    const staffIds: Record<string, string> = {};
    for (const s of STAFF) {
      const existing = (await db.query("SELECT id FROM users WHERE email = $1", [s.email])).rows[0];
      if (existing) {
        staffIds[s.key] = String(existing.id);
        continue;
      }
      const mail = new FakeEmailProvider();
      const service = new InvitationService({ repo, email: mail, crypto, appUrl });
      await service.create({
        email: s.email,
        role: s.role,
        invitedBy: setupId,
        inviterRoles: ["super_admin"],
      });
      const token = (mail.sent.at(-1)?.variables.link as string).split("/invite/")[1] as string;
      await service.enrol(token);
      const inv = await repo.openInvitation(hashToken(token));
      const totpSecret = await crypto.unseal(inv?.pendingTotpSecret as string);
      const made = await service.accept({
        token,
        name: s.name,
        password: DEV_PASSWORD,
        code: totpCode(totpSecret, Date.now()),
      });
      staffIds[s.key] = made.userId;
      secrets[s.key] = { email: s.email, totpSecret };
    }

    // Attach the three signing-in doctors to the first three demo doctors (fee, hours, specialty
    // already exist). Their names change to match the account.
    const demos = demoDoctors(3);
    for (const [i, key] of (["doctor1", "doctor2", "doctor3"] as const).entries()) {
      const d = demos[i];
      const userId = staffIds[key];
      if (!d || !userId) continue;
      await db.query(
        `UPDATE doctors SET user_id = $1 WHERE id = $2 AND user_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM doctors WHERE user_id = $1)`,
        [userId, d.id],
      );
    }

    // Patients: a verified phone, the patient role and a profile of their own.
    const patientIds: Record<string, { userId: string; profileId: string }> = {};
    for (const p of PATIENTS) {
      await db.query(
        `INSERT INTO users (id, name, email, phone_number, phone_number_verified, phone_verified_at)
         VALUES ($1, $2, $3, $4, true, now()) ON CONFLICT DO NOTHING`,
        [uuidv7(), p.name, `${p.key}@no-email.invalid`, p.phone],
      );
      const userId = String(
        (await db.query("SELECT id FROM users WHERE phone_number = $1", [p.phone])).rows[0]?.id,
      );
      await repo.grantPatientRole(userId);
      // Every run puts the test patient back to "never signed in": the first sign-in from a browser
      // is then trusted at once (the phone-recycling defence treats a brand-new account that way),
      // instead of asking for recovery codes a test account does not have.
      await db.query(
        "UPDATE users SET last_active_at = NULL, phone_changed_at = NULL, force_step_up_at = NULL WHERE id = $1",
        [userId],
      );
      await db.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
      await db.query(
        "UPDATE trusted_devices SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId],
      );
      await db.query(
        `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
         SELECT $1, $2, 'self', $3, $4, $5, false
          WHERE NOT EXISTS (SELECT 1 FROM patients WHERE account_user_id = $2 AND relation = 'self')`,
        [uuidv7(), userId, p.name, p.dob, p.gender],
      );
      const profileId = String(
        (
          await db.query(
            "SELECT id FROM patients WHERE account_user_id = $1 AND relation = 'self'",
            [userId],
          )
        ).rows[0]?.id,
      );
      patientIds[p.key] = { userId, profileId };
      secrets[p.key] = { phone: p.phone };
    }
    // A child on the first patient's account, so family booking can be tried.
    const first = patientIds.patient1;
    if (first) {
      await db.query(
        `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
         SELECT $1, $2, 'child', 'Kiran Patient', (CURRENT_DATE - interval '8 years')::date, 'female', true
          WHERE NOT EXISTS (SELECT 1 FROM patients WHERE account_user_id = $2 AND relation = 'child')`,
        [uuidv7(), first.userId],
      );
    }

    // Bookings that are already paid, so a video visit can be tried without a payment account:
    // one open for joining right now, one tomorrow, one finished.
    const doctor1 = demos[0];
    if (doctor1 && first) {
      const has = await db.query("SELECT 1 FROM appointments WHERE patient_id = $1 LIMIT 1", [
        first.profileId,
      ]);
      if (has.rows.length === 0) {
        const HOUR = 3_600_000;
        const slots = [
          { at: Date.now() + 3 * 60_000, status: "scheduled" },
          { at: Date.now() + 26 * HOUR, status: "scheduled" },
          { at: Date.now() - 72 * HOUR, status: "completed" },
        ];
        for (const [i, slot] of slots.entries()) {
          const id = uuidv7();
          const start = new Date(slot.at);
          await db.query(
            `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 30000)`,
            [
              id,
              first.profileId,
              doctor1.id,
              first.userId,
              start,
              new Date(start.getTime() + 30 * 60_000),
              slot.status,
            ],
          );
          await db.query(
            `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, gateway_payment_id, idempotency_key, captured_at)
             VALUES ($1, $2, $3, 30000, 'captured', $4, $5, $6, now())`,
            [
              uuidv7(),
              id,
              first.userId,
              `order_demo_${i}_${randomBytes(4).toString("hex")}`,
              `pay_demo_${i}_${randomBytes(4).toString("hex")}`,
              `demo-seed-${id}`,
            ],
          );
        }
      }
    }
  } finally {
    await pool.end();
  }

  return secrets;
}

/** Merges new secrets into the ignored local file so a second run keeps the earlier ones. */
export function saveDevAccounts(
  fresh: Record<string, { email?: string; phone?: string; totpSecret?: string }>,
  existing: Record<string, unknown> = {},
) {
  const all = { ...existing, ...fresh };
  writeFileSync(DEV_FILE, JSON.stringify({ password: DEV_PASSWORD, accounts: all }, null, 2));
  return all;
}
