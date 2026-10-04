import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./testing";

// Constraints of the consultation and consent tables (migration 0021), exercised as the app role.
let t: Awaited<ReturnType<typeof createTestDb>>;
let n = 0;
const id = () => `0190a1b2-c3d4-7e5f-8a9b-${String(700000000000 + ++n)}`;
const rejects = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);
const room = () => `room_${String(n++).padStart(8, "0")}_abcdefghijkl`;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

async function fixture() {
  const user = id();
  await t.app.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    user,
    `${user}@example.com`,
  ]);
  const patient = id();
  await t.app.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patient, user],
  );
  const doctor = id();
  await t.app.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,'Dr Video',$2,'Council','MBBS',$3)`,
    [doctor, `VID-${n}`, `${doctor}@example.com`],
  );
  const appt = id();
  const start = new Date(Date.UTC(2031, 0, 1) + n * 3_600_000);
  await t.app.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled',50000)`,
    [appt, patient, doctor, user, start, new Date(start.getTime() + 1_800_000)],
  );
  return { user, patient, doctor, appt };
}

async function policy(kind = "video", version = `v${++n}`) {
  const pid = id();
  const body = `Policy text ${n}`;
  await t.app.query(
    `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
     VALUES ($1,$2,$3,'en',$4,$5,'2026-01-01')`,
    [pid, kind, version, body, createHash("sha256").update(body).digest("hex")],
  );
  return pid;
}

describe("consent policies", () => {
  it("a policy has a known kind, language, version and a real hash, and one text per version", async () => {
    const hash = "a".repeat(64);
    await rejects(
      t.app.query(
        `INSERT INTO consent_policies (id, kind, version, body, content_hash, effective_from)
         VALUES ($1,'cookies','v1','x',$2,'2026-01-01')`,
        [id(), hash],
      ),
      /consent_policies_kind_check/,
    );
    await rejects(
      t.app.query(
        `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
         VALUES ($1,'video','v1','fr','x',$2,'2026-01-01')`,
        [id(), hash],
      ),
      /consent_policies_language_check/,
    );
    await rejects(
      t.app.query(
        `INSERT INTO consent_policies (id, kind, version, body, content_hash, effective_from)
         VALUES ($1,'video','v1','x','nothex','2026-01-01')`,
        [id()],
      ),
      /consent_policies_hash_check/,
    );
    await policy("telemedicine", "same");
    await rejects(policy("telemedicine", "same"), /consent_policies_version_idx/);
  });

  it("a published text cannot be edited or removed, even by the application's role", async () => {
    const p = await policy();
    await rejects(
      t.app.query("UPDATE consent_policies SET body = 'changed' WHERE id=$1", [p]),
      /permission denied/,
    );
    await rejects(
      t.app.query("DELETE FROM consent_policies WHERE id=$1", [p]),
      /permission denied/,
    );
  });
});

describe("user consents", () => {
  it("one live consent per person, patient and policy; a withdrawn one frees the slot", async () => {
    const f = await fixture();
    const p = await policy();
    const give = () =>
      t.app.query(
        `INSERT INTO user_consents (id, user_id, patient_id, policy_id) VALUES ($1,$2,$3,$4)`,
        [id(), f.user, f.patient, p],
      );
    await give();
    await rejects(give(), /user_consents_live_idx/);
    await t.app.query("UPDATE user_consents SET withdrawn_at = now() WHERE user_id=$1", [f.user]);
    await give();
  });

  it("only the withdrawal time can change, once, and nothing is deleted", async () => {
    const f = await fixture();
    const p = await policy();
    const cid = id();
    await t.app.query(
      `INSERT INTO user_consents (id, user_id, patient_id, policy_id) VALUES ($1,$2,$3,$4)`,
      [cid, f.user, f.patient, p],
    );
    await rejects(
      t.app.query("UPDATE user_consents SET granted = false WHERE id=$1", [cid]),
      /permission denied/,
    );
    await rejects(
      t.app.query("UPDATE user_consents SET policy_id = $2 WHERE id=$1", [cid, await policy()]),
      /permission denied/,
    );
    await rejects(t.app.query("DELETE FROM user_consents WHERE id=$1", [cid]), /permission denied/);
    await t.app.query("UPDATE user_consents SET withdrawn_at = now() WHERE id=$1", [cid]);
    await rejects(
      t.app.query("UPDATE user_consents SET withdrawn_at = now() WHERE id=$1", [cid]),
      /withdrawn, once|consent record/,
    );
  });
});

describe("consultations", () => {
  async function consult(
    f: Awaited<ReturnType<typeof fixture>>,
    over: Record<string, unknown> = {},
  ) {
    const cid = id();
    const row = {
      room: room(),
      status: "pending",
      started: null as string | null,
      ended: null as string | null,
      ...over,
    };
    await t.app.query(
      `INSERT INTO consultations (id, appointment_id, provider, provider_room_ref, status, started_at, ended_at)
       VALUES ($1,$2,'agora',$3,$4,$5,$6)`,
      [cid, f.appt, row.room, row.status, row.started, row.ended],
    );
    return cid;
  }

  it("a consultation has one room, one per appointment, with a name of the right shape", async () => {
    const f = await fixture();
    await consult(f);
    await rejects(consult(f), /consultations_appointment_idx/);
    const g = await fixture();
    for (const bad of ["short", "has space in it aaaaaaaa", "../etc/passwd-aaaaaaaa"]) {
      await rejects(consult(g, { room: bad }), /consultations_room_check/);
    }
    const shared = room();
    await consult(g, { room: shared });
    const h = await fixture();
    await rejects(consult(h, { room: shared }), /consultations_room_idx/);
  });

  it("the times agree with the status", async () => {
    const f = await fixture();
    await rejects(consult(f, { status: "live" }), /consultations_times_check/);
    await rejects(
      consult(f, { status: "pending", started: "2031-01-01T10:00:00Z" }),
      /consultations_times_check/,
    );
    await rejects(
      consult(f, {
        status: "ended",
        started: "2031-01-01T10:00:00Z",
        ended: "2031-01-01T09:00:00Z",
      }),
      /consultations_times_check/,
    );
    await consult(f, {
      status: "ended",
      started: "2031-01-01T10:00:00Z",
      ended: "2031-01-01T10:30:00Z",
    });
  });

  it("each person has one user id in a consultation, unique within it, as a positive 32-bit number", async () => {
    const f = await fixture();
    const cid = await consult(f);
    const other = id();
    await t.app.query("INSERT INTO users (id, name, email) VALUES ($1,'D',$2)", [
      other,
      `${other}@example.com`,
    ]);
    const part = (userId: string, uid: number, role = "patient") =>
      t.app.query(
        `INSERT INTO consultation_participants (id, consultation_id, user_id, role, provider_uid) VALUES ($1,$2,$3,$4,$5)`,
        [id(), cid, userId, role, uid],
      );
    await part(f.user, 1234567);
    await rejects(part(f.user, 7654321), /consultation_participants_user_idx/);
    await rejects(part(other, 1234567, "doctor"), /consultation_participants_uid_idx/);
    await rejects(part(other, 0, "doctor"), /consultation_participants_uid_check/);
    await rejects(part(other, 4294967296, "doctor"), /consultation_participants_uid_check/);
    await rejects(part(other, 5, "admin"), /consultation_participants_role_check/);
    await part(other, 4294967295, "doctor");
  });

  it("a recording needs two different consents and a file once it is stored", async () => {
    const f = await fixture();
    const cid = await consult(f);
    const pol = await policy("recording");
    const patientConsent = id();
    const doctorConsent = id();
    await t.app.query(
      `INSERT INTO user_consents (id, user_id, patient_id, policy_id) VALUES ($1,$2,$3,$4)`,
      [patientConsent, f.user, f.patient, pol],
    );
    const doctorUser = id();
    await t.app.query("INSERT INTO users (id, name, email) VALUES ($1,'D',$2)", [
      doctorUser,
      `${doctorUser}@example.com`,
    ]);
    await t.app.query(`INSERT INTO user_consents (id, user_id, policy_id) VALUES ($1,$2,$3)`, [
      doctorConsent,
      doctorUser,
      pol,
    ]);
    const rec = (over: { p?: string; d?: string; status?: string } = {}) =>
      t.app.query(
        `INSERT INTO consultation_recordings (id, consultation_id, patient_consent_id, doctor_consent_id, status, retention_until)
         VALUES ($1,$2,$3,$4,$5,'2031-06-01')`,
        [id(), cid, over.p ?? patientConsent, over.d ?? doctorConsent, over.status ?? "recording"],
      );
    await rejects(rec({ d: patientConsent }), /consultation_recordings_consents_check/);
    await rejects(rec({ status: "stored" }), /consultation_recordings_stored_check/);
    await rec();
  });
});
