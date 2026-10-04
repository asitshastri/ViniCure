import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryCache } from "../../lib/cache";
import { Crypto, LocalKeyProvider } from "../../lib/crypto/crypto";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { PatientRepo } from "../patients/repo";
import { AppointmentService, holdBody } from "./appointments";
import { AppointmentRepo } from "./appointments-repo";
import { SchedulingRepo } from "./repo";
import { SlotService } from "./service";

// The booking race on real Postgres as the `app` role, with a connection per request.
// Skipped unless DATABASE_TEST_URL is set.
const url = process.env.DATABASE_TEST_URL;
const NOW = new Date("2026-11-01T10:00:00+05:30");

describe.skipIf(!url)("slot holds under concurrency (real Postgres)", () => {
  let pool: pg.Pool;
  let service: AppointmentService;
  const doctorId = uuidv7();
  const users: string[] = [];
  const patients: string[] = [];

  const q = () => ({
    query: async (text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
    }),
  });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 12 });
    const repo = new AppointmentRepo(q());
    const slots = new SlotService({
      repo: new SchedulingRepo(q()),
      cache: () => new MemoryCache(),
      env: "test",
      now: () => NOW,
      booked: (d, f, t) => repo.activeIntervals(d, f, t),
    });
    service = new AppointmentService({
      repo,
      patients: new PatientRepo(q()),
      slots,
      crypto: () => new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars")),
    });
    await pool.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
         consultation_fee_paise, kyc_status, status, applicant_email)
       VALUES ($1,'Dr Race',$2,'Council','MBBS',45000,'approved','active',$3)`,
      [doctorId, `RACE-${Date.now()}`, `${doctorId}@example.com`],
    );
    await pool.query(
      `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
       VALUES ($1,$2,1,'09:00','12:00',30,'2026-01-01')`,
      [uuidv7(), doctorId],
    );
  });

  afterAll(async () => {
    // The status history is append-only, so test rows stay; only the rest is removed where allowed.
    await pool.end();
  });

  async function newPerson() {
    const id = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
      id,
      `${id}@no-email.invalid`,
    ]);
    const patientId = uuidv7();
    await pool.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Race Person','1990-01-01','female',false)`,
      [patientId, id],
    );
    users.push(id);
    patients.push(patientId);
    return { principal: { userId: id, roles: ["patient" as const] }, patientId };
  }

  it("10 simultaneous requests for one slot: exactly 1 holds it and 9 get 409", async () => {
    const startAt = new Date("2026-11-02T09:00:00+05:30").toISOString();
    const people = await Promise.all(Array.from({ length: 10 }, newPerson));
    const results = await Promise.allSettled(
      people.map((p) =>
        service.hold(p.principal, holdBody.parse({ patientId: p.patientId, doctorId, startAt })),
      ),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    for (const r of lost) {
      const error = (r as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(409);
      expect((error as AppError).code).toBe("slot_taken");
    }
    // The database shows exactly one active row for that slot.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM appointments
        WHERE doctor_id = $1 AND start_at = $2 AND status IN ('held', 'scheduled', 'in_progress')`,
      [doctorId, startAt],
    );
    expect(rows[0]?.n).toBe(1);
    // One history row, for the winner only.
    const history = await pool.query(
      `SELECT count(*)::int AS n FROM appointment_status_history h
         JOIN appointments a ON a.id = h.appointment_id WHERE a.doctor_id = $1 AND a.start_at = $2`,
      [doctorId, startAt],
    );
    expect(history.rows[0]?.n).toBe(1);
  });

  it("one person sending the same request 10 times at once holds the slot once", async () => {
    const startAt = new Date("2026-11-02T09:30:00+05:30").toISOString();
    const p = await newPerson();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.hold(p.principal, holdBody.parse({ patientId: p.patientId, doctorId, startAt })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM appointments WHERE doctor_id = $1 AND start_at = $2`,
      [doctorId, startAt],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("neighbouring slots do not block each other under load", async () => {
    const times = ["10:00", "10:30"];
    const people = await Promise.all(times.map(newPerson));
    const results = await Promise.allSettled(
      people.map((p, i) =>
        service.hold(
          p.principal,
          holdBody.parse({
            patientId: p.patientId,
            doctorId,
            startAt: new Date(`2026-11-02T${times[i]}:00+05:30`).toISOString(),
          }),
        ),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("two cancels and a reschedule at the same moment: one cancel wins, no double history", async () => {
    const owner = await newPerson();
    const doctorUser = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'D',$2)", [
      doctorUser,
      `${doctorUser}@no-email.invalid`,
    ]);
    await pool.query("UPDATE doctors SET user_id = $1 WHERE id = $2", [doctorUser, doctorId]);
    const held = await service.hold(
      owner.principal,
      holdBody.parse({
        patientId: owner.patientId,
        doctorId,
        startAt: new Date("2026-11-02T11:00:00+05:30").toISOString(),
      }),
    );
    await pool.query(
      "UPDATE appointments SET status = 'scheduled', hold_expires_at = NULL WHERE id = $1",
      [held.id],
    );
    const all = await Promise.allSettled([
      service.cancel(owner.principal, held.id, { reason: "other" }),
      service.cancel({ userId: doctorUser, roles: ["doctor"] }, held.id, {
        reason: "doctor_unavailable",
      }),
      service.reschedule(owner.principal, held.id, {
        startAt: new Date("2026-11-02T11:30:00+05:30").toISOString(),
      }),
    ]);
    expect(all.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    for (const r of all) {
      if (r.status === "rejected") expect((r.reason as AppError).status).toBe(409);
    }
    const cancels = await pool.query(
      "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id = $1 AND to_status LIKE 'cancelled%'",
      [held.id],
    );
    expect(cancels.rows[0]?.n).toBe(1);
  });
});
