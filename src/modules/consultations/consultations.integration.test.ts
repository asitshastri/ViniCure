import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeVideoProvider } from "../../lib/adapters/fakes";
import type { Queryable } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { ConsentRepo } from "../consent/repo";
import { ConsentService } from "../consent/service";
import { RecordingRepo } from "./recording-repo";
import { RecordingService } from "./recording";
import { ConsultationRepo } from "./repo";
import { ConsultationService } from "./service";

// Joining and ending at the same moment, against real Postgres as the `app` role. Skipped unless
// DATABASE_TEST_URL is set.
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("consultations on real Postgres", () => {
  let pool: pg.Pool;
  let service: ConsultationService;
  let consent: ConsentService;
  let recording: RecordingService;
  const video = new FakeVideoProvider();

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 12 });
    const db: Queryable = {
      query: async (text, params) => ({
        rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
      }),
    };
    const tx = {
      async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn({
            query: async (t, p) => ({
              rows: (await client.query(t, p)).rows as Record<string, unknown>[],
            }),
          });
          await client.query("COMMIT");
          return out;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw e;
        } finally {
          client.release();
        }
      },
    };
    consent = new ConsentService({ repo: new ConsentRepo(db) });
    service = new ConsultationService({
      repo: new ConsultationRepo(db, tx),
      video: () => video,
      consent,
      appId: () => "fake_app_id",
      tokenTtlSeconds: () => 3600,
      window: () => ({ earlyMinutes: 10, lateMinutes: 30 }),
    });
    recording = new RecordingService({
      repo: new RecordingRepo(db, tx),
      video: () => video,
      enabled: () => true,
      retentionDays: () => 30,
      newKey: () => `recording/2043/${uuidv7()}.mp4`,
      bucket: () => "it-recordings",
      enqueueStore: async () => undefined,
      storage: () => {
        throw new Error("not used here");
      },
    });
  });
  afterAll(() => pool.end());

  async function setup() {
    const mk = async (roles: ("patient" | "doctor")[]) => {
      const id = uuidv7();
      await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
        id,
        `${id}@no-email.invalid`,
      ]);
      return { userId: id, roles };
    };
    const patient = await mk(["patient"]);
    const doctor = await mk(["doctor"]);
    const patientId = uuidv7();
    await pool.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Race Patient','1990-01-01','female',false)`,
      [patientId, patient.userId],
    );
    const doctorId = uuidv7();
    await pool.query(
      `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications, applicant_email)
       VALUES ($1,$2,'Dr Race',$3,'Council','MBBS',$4)`,
      [doctorId, doctor.userId, `RC-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
    );
    // A booking that is in its join window right now.
    const appt = uuidv7();
    const start = new Date(Date.now() + 2 * 60_000);
    await pool.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000)`,
      [appt, patientId, doctorId, patient.userId, start, new Date(start.getTime() + 30 * 60_000)],
    );
    await pool.query(
      `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, gateway_payment_id, idempotency_key, captured_at)
       VALUES ($1,$2,$3,30000,'captured',$4,$5,$6, now())`,
      [
        uuidv7(),
        appt,
        patient.userId,
        `order_${appt}`,
        `pay_${appt.slice(-12)}`,
        `key-${appt}-0000000`,
      ],
    );
    // Texts in force, and the patient's agreement to them.
    const version = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    for (const kind of ["telemedicine", "video"]) {
      const body = `${kind} ${version}`;
      await pool.query(
        `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
         VALUES ($1,$2,$3,'en',$4,$5, CURRENT_DATE)`,
        [uuidv7(), kind, version, body, createHash("sha256").update(body).digest("hex")],
      );
    }
    const need = await consent.required(patient, appt);
    await consent.grant(patient, appt, { policyIds: need.required.map((p) => p.policyId) }, null);
    return { patient, doctor, appt };
  }

  it("the patient and the doctor joining many times at once make one consultation and one seat each", async () => {
    const { patient, doctor, appt } = await setup();
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => service.join(patient, appt)),
      ...Array.from({ length: 8 }, () => service.join(doctor, appt)),
    ]);
    expect(new Set(results.map((r) => r.channel)).size).toBe(1);
    expect(new Set(results.filter((r) => r.role === "patient").map((r) => r.uid)).size).toBe(1);
    expect(new Set(results.filter((r) => r.role === "doctor").map((r) => r.uid)).size).toBe(1);
    const c = await pool.query("SELECT id, status FROM consultations WHERE appointment_id=$1", [
      appt,
    ]);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]?.status).toBe("live");
    const seats = await pool.query(
      "SELECT count(*)::int AS n FROM consultation_participants WHERE consultation_id=$1",
      [c.rows[0]?.id],
    );
    expect(seats.rows[0]?.n).toBe(2);
    const started = await pool.query(
      "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='in_progress'",
      [appt],
    );
    expect(started.rows[0]?.n).toBe(1);
  });

  it("the doctor ending at the same moment as renewals: one end, and nobody renews afterwards", async () => {
    const { patient, doctor, appt } = await setup();
    await service.join(patient, appt);
    await service.join(doctor, appt);
    const ends = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.end(doctor, appt).then(
          () => "ended",
          () => "refused",
        ),
      ),
    );
    expect(ends.filter((r) => r === "ended")).toHaveLength(1);
    const after = await Promise.all([
      service.renew(patient, appt).then(
        () => "renewed",
        () => "refused",
      ),
      service.renew(doctor, appt).then(
        () => "renewed",
        () => "refused",
      ),
    ]);
    expect(after).toEqual(["refused", "refused"]);
    const done = await pool.query(
      "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='completed'",
      [appt],
    );
    expect(done.rows[0]?.n).toBe(1);
  });

  it("many doctor clicks at once start one recording, and a withdrawal at the same moment leaves none running", async () => {
    const { patient, doctor, appt } = await setup();
    const policyId = await pool
      .query(
        `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
         VALUES ($1,'recording',$2,'en','r',$3, CURRENT_DATE) RETURNING id`,
        [uuidv7(), `it-${uuidv7()}`, createHash("sha256").update("r").digest("hex")],
      )
      .then((r) => String(r.rows[0]?.id));
    await service.join(patient, appt);
    await service.join(doctor, appt);
    await recording.consent(patient, appt, { policyId }, null);
    await recording.consent(doctor, appt, { policyId }, null);
    const starts = await Promise.all(
      Array.from({ length: 8 }, () =>
        recording.start(doctor, appt).then(
          () => "started",
          () => "refused",
        ),
      ),
    );
    expect(starts.filter((r) => r === "started")).toHaveLength(1);
    expect(video.recordings.size).toBe(1);

    // The patient withdraws while the doctor stops and starts again: when it settles, if the
    // patient's agreement is gone, nothing may be recording.
    await Promise.all([
      recording.withdraw(patient, appt),
      recording.stop(doctor, appt).catch(() => undefined),
      recording.start(doctor, appt).catch(() => undefined),
    ]);
    const running = await pool.query(
      `SELECT count(*)::int AS n FROM consultation_recordings r
         JOIN consultations c ON c.id = r.consultation_id
        WHERE c.appointment_id = $1 AND r.status = 'recording'`,
      [appt],
    );
    const live = await pool.query(
      `SELECT count(*)::int AS n FROM user_consents WHERE user_id = $1 AND withdrawn_at IS NULL AND consultation_id IS NOT NULL`,
      [patient.userId],
    );
    expect(live.rows[0]?.n).toBe(0);
    expect(running.rows[0]?.n).toBe(0);
  });

  it("the app role cannot rewrite or delete a consent, a policy text or a seat's revocation history", async () => {
    await expect(pool.query("DELETE FROM user_consents")).rejects.toThrow(/permission denied/);
    await expect(pool.query("UPDATE user_consents SET granted = false")).rejects.toThrow(
      /permission denied/,
    );
    await expect(pool.query("UPDATE consent_policies SET body = 'x'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(pool.query("DELETE FROM consent_policies")).rejects.toThrow(/permission denied/);
  });
});
