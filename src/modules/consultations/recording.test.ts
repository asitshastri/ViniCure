import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakeVideoProvider } from "../../lib/adapters/fakes";
import type { Role } from "../../lib/api/types";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { StorageService, type ObjectInfo, type ObjectStore } from "../../lib/storage/storage";
import { ConsentRepo } from "../consent/repo";
import { ConsentService } from "../consent/service";
import type { Principal } from "../identity/policy";
import { RecordingRepo } from "./recording-repo";
import { RecordingService } from "./recording";
import { ConsultationRepo } from "./repo";
import { ConsultationService } from "./service";

// Recording a consultation (P6-08): off by default, both people agree for this consultation, only
// the doctor starts and stops it, a withdrawal or the end of the call stops it, the file is
// checked before it is registered, and the retention job deletes it.

let q: Queryable;
let tx: TxRunner;
let video: FakeVideoProvider;
let service: ConsultationService;
let recording: RecordingService;
let enabled = true;
let retentionDays: number | undefined = 90;
let enqueued: string[] = [];
let enqueueDown = false;
let store: MemoryStore;
let nowMs = 0;

let patient: Principal;
let doctor: Principal;
let otherDoctor: Principal;
let stranger: Principal;
let admin: Principal;
let patientId: string;
let doctorId: string;

const MIN = 60_000;
const START = Date.UTC(2043, 5, 10, 10, 0, 0);
const BUCKET = "vc-recordings";
const MP4 = Uint8Array.from([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]);

class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, { head: Uint8Array; size: number }>();
  readonly deleted: string[] = [];
  async presignPut() {
    return "https://fake/put";
  }
  async presignGet() {
    return "https://fake/get";
  }
  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    const o = this.objects.get(`${bucket}/${key}`);
    return o ? { sizeBytes: o.size, contentType: undefined } : null;
  }
  async readHead(bucket: string, key: string) {
    return this.objects.get(`${bucket}/${key}`)?.head ?? new Uint8Array();
  }
  async read(bucket: string, key: string) {
    const head = this.objects.get(`${bucket}/${key}`)?.head ?? new Uint8Array();
    return (async function* () {
      yield head;
    })();
  }
  async put() {}
  async delete(bucket: string, key: string) {
    this.deleted.push(`${bucket}/${key}`);
    this.objects.delete(`${bucket}/${key}`);
  }
  arrive(key: string, head: Uint8Array, size = 5_000_000) {
    this.objects.set(`${BUCKET}/${key}`, { head, size });
  }
}

async function person(roles: Role[] = ["patient"]): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
async function doctorRow(user: Principal): Promise<string> {
  const id = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,$2,'Dr Record',$3,'Council','MBBS',$4)`,
    [id, user.userId, `RC-${id.slice(-8)}`, `${id}@example.com`],
  );
  return id;
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
const rows = async (sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows;

let slot = 0;
/** A paid, scheduled appointment, with the clock five minutes before it. */
async function booking() {
  const appt = uuidv7();
  const start = new Date(START + slot++ * 86_400_000);
  nowMs = start.getTime() - 5 * MIN;
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000)`,
    [appt, patientId, doctorId, patient.userId, start, new Date(start.getTime() + 30 * MIN)],
  );
  await q.query(
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
  return appt;
}

/** A live consultation: the doctor has joined. */
async function live() {
  const appt = await booking();
  await service.join(doctor, appt);
  return appt;
}

let policyN = 0;
async function recordingPolicy(from = "2000-01-01") {
  const id = uuidv7();
  const body = `recording text ${++policyN}`;
  await q.query(
    `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
     VALUES ($1,'recording',$2,'en',$3,$4,$5)`,
    [id, `r${policyN}-${Date.now()}`, body, createHash("sha256").update(body).digest("hex"), from],
  );
  return id;
}
const currentText = async (who: Principal, appt: string) => {
  const view = await recording.state(who, appt);
  if (!view.consentText) throw new Error("no text offered");
  return view.consentText.policyId;
};
const agree = async (who: Principal, appt: string) =>
  recording.consent(who, appt, { policyId: await currentText(who, appt) }, "203.0.113.7");
const agreeBoth = async (appt: string) => {
  await agree(patient, appt);
  await agree(doctor, appt);
};
const recordingRows = (appt: string) =>
  rows(
    `SELECT r.id, r.status, r.object_key, r.retention_until::text AS retention_until, r.file_id, r.stopped_at, r.deleted_at
       FROM consultation_recordings r JOIN consultations c ON c.id = r.consultation_id
      WHERE c.appointment_id = $1 ORDER BY r.created_at`,
    [appt],
  );

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (t, p) => ({ rows: (await pg.db.query(t, p)).rows as Record<string, unknown>[] }),
  };
  tx = {
    transaction: (fn) =>
      pg.db.transaction((t) =>
        fn({
          query: async (text, params) => ({
            rows: (await t.query(text, params)).rows as Record<string, unknown>[],
          }),
        }),
      ),
  };
}, 60_000);

beforeEach(async () => {
  // Rows left by earlier tests must not count in this one (the sweeps look at every recording).
  await q.query("UPDATE consultation_recordings SET deleted_at = now() WHERE deleted_at IS NULL");
  slot = 0;
  enabled = true;
  retentionDays = 90;
  enqueued = [];
  enqueueDown = false;
  video = new FakeVideoProvider();
  store = new MemoryStore();
  recording = new RecordingService({
    repo: new RecordingRepo(q, tx),
    video: () => video,
    enabled: () => enabled,
    retentionDays: () => retentionDays,
    newKey: () => `recording/2043/${uuidv7()}.mp4`,
    bucket: () => BUCKET,
    enqueueStore: async (id) => {
      if (enqueueDown) throw new Error("queue down");
      enqueued.push(id);
    },
    storage: () =>
      new StorageService(store, {
        buckets: { files: "f", exports: "e", recordings: BUCKET },
        region: "ap-south-1",
        signedUrlTtlSeconds: 300,
      }),
  });
  service = new ConsultationService({
    repo: new ConsultationRepo(q, tx),
    video: () => video,
    consent: new ConsentService({ repo: new ConsentRepo(q) }),
    appId: () => "fake_app_id",
    tokenTtlSeconds: () => 3600,
    window: () => ({ earlyMinutes: 10, lateMinutes: 30 }),
    now: () => nowMs,
    stopRecording: (id) => recording.stopForConsultation(id, "call_ended"),
  });
  patient = await person();
  doctor = await person(["doctor"]);
  otherDoctor = await person(["doctor"]);
  await doctorRow(otherDoctor);
  stranger = await person();
  admin = await person(["admin"]);
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Record Patient','1990-01-01','female',false)`,
    [patientId, patient.userId],
  );
  doctorId = await doctorRow(doctor);
  await recordingPolicy();
  // Every test starts with the telemedicine and video texts agreed, so the join works.
  for (const kind of ["telemedicine", "video"]) {
    const body = `${kind} ${Date.now()}`;
    await q.query(
      `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
       VALUES ($1,$2,$3,'en',$4,$5,'2000-01-01') ON CONFLICT DO NOTHING`,
      [
        uuidv7(),
        kind,
        `t${policyN}-${kind}-${Date.now()}`,
        body,
        createHash("sha256").update(body).digest("hex"),
      ],
    );
  }
});

describe("off by default", () => {
  it("with the flag off nothing is offered, nothing can be agreed to or started, and nothing is stored", async () => {
    enabled = false;
    const appt = await live();
    expect(await recording.state(patient, appt)).toEqual({
      enabled: false,
      consentText: null,
      agreed: { me: false, other: false },
      recording: false,
    });
    const body = { policyId: uuidv7() };
    expect(await code(recording.consent(patient, appt, body, null))).toBe("not_found");
    expect(await code(recording.consent(doctor, appt, body, null))).toBe("not_found");
    expect(await code(recording.start(doctor, appt))).toBe("not_found");
    expect(video.recordings.size).toBe(0);
    expect(await recordingRows(appt)).toHaveLength(0);
  });

  it("a provider that cannot record is not offered recording", async () => {
    const appt = await live();
    const quiet = Object.create(video) as FakeVideoProvider;
    (quiet as { startRecording?: unknown }).startRecording = undefined;
    video = quiet;
    expect((await recording.state(doctor, appt)).enabled).toBe(false);
    expect(await code(recording.start(doctor, appt))).toBe("not_found");
  });

  it("the recording flag, bucket and retention are checked at start", async () => {
    const appt = await live();
    await agreeBoth(appt);
    retentionDays = undefined;
    expect(await code(recording.start(doctor, appt))).toBe("unavailable");
    expect(video.recordings.size).toBe(0);
  });
});

describe("both people agree, for this consultation", () => {
  it("nothing starts until the patient and the doctor have both agreed", async () => {
    const appt = await live();
    expect(await code(recording.start(doctor, appt))).toBe("consent_required");
    await agree(patient, appt);
    expect(await code(recording.start(doctor, appt))).toBe("consent_required");
    expect(video.recordings.size).toBe(0);
    await agree(doctor, appt);
    const view = await recording.start(doctor, appt);
    expect(view.recording).toBe(true);
    expect(video.recordings.size).toBe(1);
  });

  it("the doctor alone cannot start it either", async () => {
    const appt = await live();
    await agree(doctor, appt);
    expect(await code(recording.start(doctor, appt))).toBe("consent_required");
    expect(await recordingRows(appt)).toHaveLength(0);
  });

  it("starting tells the provider to write into our bucket at a random key, and records the retention end", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    const [target] = [...video.recordings.values()];
    expect(target?.bucket).toBe(BUCKET);
    expect(target?.objectKey).toMatch(/^recording\/2043\/[0-9a-f-]{36}\.mp4$/);
    expect(target?.objectKey).not.toContain(appt);
    expect(target?.objectKey).not.toContain(patient.userId);
    const [row] = await recordingRows(appt);
    expect(row?.status).toBe("recording");
    expect(row?.object_key).toBe(target?.objectKey);
    const expected = (await rows("SELECT (CURRENT_DATE + 90)::text AS d"))[0]?.d;
    expect(row?.retention_until).toBe(expected);
  });

  it("an agreement is for one consultation: the next one asks again", async () => {
    const first = await live();
    await agreeBoth(first);
    const second = await live();
    expect(await code(recording.start(doctor, second))).toBe("consent_required");
    const view = await recording.state(patient, second);
    expect(view.agreed).toEqual({ me: false, other: false });
    expect(view.consentText).not.toBeNull();
  });

  it("an agreement to an older text does not count once a newer text is in force", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recordingPolicy("2001-01-01");
    expect(await code(recording.start(doctor, appt))).toBe("consent_required");
    const view = await recording.state(patient, appt);
    expect(view.agreed.me).toBe(false);
    expect(view.consentText).not.toBeNull();
  });

  it("only the text in force can be agreed to", async () => {
    const appt = await live();
    const old = await currentText(patient, appt);
    await recordingPolicy("2001-01-01");
    expect(await code(recording.consent(patient, appt, { policyId: old }, null))).toBe(
      "validation_failed",
    );
    expect(await code(recording.consent(patient, appt, { policyId: uuidv7() }, null))).toBe(
      "validation_failed",
    );
  });

  it("agreeing twice records one live agreement, and the record names who, what and from where", async () => {
    const appt = await live();
    const policyId = await currentText(patient, appt);
    await recording.consent(patient, appt, { policyId }, "203.0.113.7");
    await recording.consent(patient, appt, { policyId }, "203.0.113.7");
    const consents = await rows(
      `SELECT uc.user_id, uc.patient_id, host(uc.ip) AS ip, cp.kind
         FROM user_consents uc JOIN consent_policies cp ON cp.id = uc.policy_id
        WHERE uc.consultation_id = (SELECT id FROM consultations WHERE appointment_id = $1)`,
      [appt],
    );
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      user_id: patient.userId,
      patient_id: patientId,
      ip: "203.0.113.7",
      kind: "recording",
    });
  });

  it("a doctor's agreement is the doctor's own and carries no patient", async () => {
    const appt = await live();
    await agree(doctor, appt);
    const [c] = await rows(
      "SELECT user_id, patient_id FROM user_consents WHERE consultation_id IS NOT NULL AND user_id = $1",
      [doctor.userId],
    );
    expect(c).toMatchObject({ user_id: doctor.userId, patient_id: null });
  });

  it("each person sees whether the other has agreed", async () => {
    const appt = await live();
    await agree(patient, appt);
    expect((await recording.state(patient, appt)).agreed).toEqual({ me: true, other: false });
    expect((await recording.state(doctor, appt)).agreed).toEqual({ me: false, other: true });
    expect((await recording.state(patient, appt)).consentText).toBeNull();
  });

  it("a consultation that has ended cannot be agreed to", async () => {
    const appt = await live();
    await service.end(doctor, appt);
    const body = { policyId: uuidv7() };
    expect(await code(recording.consent(patient, appt, body, null))).toBe("conflict");
  });
});

describe("who may do what", () => {
  it("only the assigned doctor starts or stops; everyone else gets 404", async () => {
    const appt = await live();
    await agreeBoth(appt);
    for (const who of [patient, otherDoctor, stranger, admin]) {
      expect(await code(recording.start(who, appt)), "start").toBe("not_found");
      expect(await code(recording.stop(who, appt)), "stop").toBe("not_found");
    }
    await recording.start(doctor, appt);
    for (const who of [patient, otherDoctor, stranger, admin]) {
      expect(await code(recording.stop(who, appt)), "stop").toBe("not_found");
    }
    expect((await recording.state(doctor, appt)).recording).toBe(true);
  });

  it("a stranger, another doctor and an admin can neither see the state, agree nor withdraw", async () => {
    const appt = await live();
    for (const who of [otherDoctor, stranger, admin]) {
      expect(await code(recording.state(who, appt))).toBe("not_found");
      expect(await code(recording.consent(who, appt, { policyId: uuidv7() }, null))).toBe(
        "not_found",
      );
      expect(await code(recording.withdraw(who, appt))).toBe("not_found");
    }
  });

  it("an appointment nobody has joined, or one that does not exist, is a 404", async () => {
    const appt = await booking();
    expect(await code(recording.state(patient, appt))).toBe("not_found");
    expect(await code(recording.state(patient, uuidv7()))).toBe("not_found");
  });

  it("recording cannot start before the call is live", async () => {
    const appt = await booking();
    await agreeJoin(appt);
    await service.join(patient, appt);
    await agree(patient, appt);
    await agree(doctor, appt);
    expect(await code(recording.start(doctor, appt))).toBe("conflict");
    expect(video.recordings.size).toBe(0);
  });

  it("starting twice is refused, and stopping with nothing running is refused", async () => {
    const appt = await live();
    await agreeBoth(appt);
    expect(await code(recording.stop(doctor, appt))).toBe("conflict");
    await recording.start(doctor, appt);
    expect(await code(recording.start(doctor, appt))).toBe("conflict");
    expect(video.recordings.size).toBe(1);
  });
});

/** The patient agrees to the join texts and the appointment is returned, so they can join. */
async function agreeJoin(appt: string) {
  const consent = new ConsentService({ repo: new ConsentRepo(q) });
  const need = await consent.required(patient, appt);
  await consent.grant(patient, appt, { policyIds: need.required.map((p) => p.policyId) }, null);
  return appt;
}

describe("stopping", () => {
  it("the doctor stops it: the provider stops, the file job is queued, the call goes on", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    const view = await recording.stop(doctor, appt);
    expect(view.recording).toBe(false);
    expect([...video.recordings.values()][0]?.stopped).toBe(true);
    const [row] = await recordingRows(appt);
    expect(row?.status).toBe("stopped");
    expect(row?.stopped_at).not.toBeNull();
    expect(enqueued).toEqual([row?.id]);
    expect(
      (await rows("SELECT status FROM consultations WHERE appointment_id = $1", [appt]))[0]?.status,
    ).toBe("live");
  });

  it("the patient withdrawing stops the recording at once and blocks starting again", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    await recording.withdraw(patient, appt);
    expect([...video.recordings.values()][0]?.stopped).toBe(true);
    expect((await recordingRows(appt))[0]?.status).toBe("stopped");
    expect((await recording.state(doctor, appt)).agreed.other).toBe(false);
    expect(await code(recording.start(doctor, appt))).toBe("consent_required");
  });

  it("the doctor withdrawing stops it too", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    await recording.withdraw(doctor, appt);
    expect((await recordingRows(appt))[0]?.status).toBe("stopped");
    expect(await code(recording.start(doctor, appt))).toBe("consent_required");
  });

  it("withdrawing still works when the feature has been switched off, and withdrawing nothing is refused", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    enabled = false;
    await recording.withdraw(patient, appt);
    expect((await recordingRows(appt))[0]?.status).toBe("stopped");
    expect(await code(recording.withdraw(patient, appt))).toBe("conflict");
  });

  it("a withdrawal is kept as a record, not erased", async () => {
    const appt = await live();
    await agree(patient, appt);
    await recording.withdraw(patient, appt);
    const [c] = await rows(
      "SELECT withdrawn_at FROM user_consents WHERE user_id = $1 AND consultation_id IS NOT NULL",
      [patient.userId],
    );
    expect(c?.withdrawn_at).not.toBeNull();
  });

  it("ending the consultation ends the recording with it", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    await service.end(doctor, appt);
    expect([...video.recordings.values()][0]?.stopped).toBe(true);
    expect((await recordingRows(appt))[0]?.status).toBe("stopped");
    expect(enqueued).toHaveLength(1);
  });

  it("ending the call succeeds even when the provider cannot stop the recording, and says so for operations", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    video.failures.failNext();
    await service.end(doctor, appt);
    expect(
      (await rows("SELECT status FROM consultations WHERE appointment_id = $1", [appt]))[0]?.status,
    ).toBe("ended");
    expect((await recordingRows(appt))[0]?.status).toBe("failed");
  });

  it("a lost queue still ends with a stopped recording that the sweep re-queues", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    enqueueDown = true;
    await recording.stop(doctor, appt);
    expect(enqueued).toHaveLength(0);
    enqueueDown = false;
    await q.query(
      "UPDATE consultation_recordings SET stopped_at = now() - interval '1 hour' WHERE status = 'stopped'",
    );
    const report = await recording.sweep();
    expect(report.requeued).toBeGreaterThanOrEqual(1);
    expect(enqueued).toHaveLength(report.requeued);
  });
});

describe("when the provider misbehaves", () => {
  it("a provider that cannot start leaves no active recording and the call goes on; starting can be tried again", async () => {
    const appt = await live();
    await agreeBoth(appt);
    video.failures.failNext();
    expect(await code(recording.start(doctor, appt))).toBe("unavailable");
    expect((await recordingRows(appt))[0]?.status).toBe("failed");
    expect((await recording.state(doctor, appt)).recording).toBe(false);
    await recording.start(doctor, appt);
    expect((await recording.state(doctor, appt)).recording).toBe(true);
  });

  it("a withdrawal while the provider is still starting undoes the start", async () => {
    const appt = await live();
    await agreeBoth(appt);
    const original = video.startRecording.bind(video);
    video.startRecording = async (room, target) => {
      const out = await original(room, target);
      // The patient withdraws in the moment between the provider starting and our noting it.
      await recording.withdraw(patient, appt);
      return out;
    };
    await recording.start(doctor, appt);
    expect([...video.recordings.values()][0]?.stopped).toBe(true);
    expect((await recordingRows(appt))[0]?.status).toBe("stopped");
  });

  it("a withdrawal that landed unseen during the start is caught by the final look", async () => {
    const appt = await live();
    await agreeBoth(appt);
    const original = video.startRecording.bind(video);
    video.startRecording = async (room, target) => {
      const out = await original(room, target);
      // Only the agreement is withdrawn here; nothing stops the recording, as if that stop had run
      // a moment too early to see it.
      const ctx = await new RecordingRepo(q, tx).contextByAppointment(appt);
      await new RecordingRepo(q, tx).withdrawConsent(String(ctx?.consultationId), patient.userId);
      return out;
    };
    await recording.start(doctor, appt);
    expect([...video.recordings.values()][0]?.stopped).toBe(true);
    expect((await recordingRows(appt))[0]?.status).toBe("stopped");
  });

  it("two doctors' clicks at once start one recording", async () => {
    const appt = await live();
    await agreeBoth(appt);
    const results = await Promise.all([
      code(recording.start(doctor, appt)),
      code(recording.start(doctor, appt)),
    ]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect((await recordingRows(appt)).filter((r) => r.status === "recording")).toHaveLength(1);
    expect(video.recordings.size).toBe(1);
  });
});

describe("the file", () => {
  async function stopped() {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    await recording.stop(doctor, appt);
    const [row] = await recordingRows(appt);
    return { appt, id: String(row?.id), key: String(row?.object_key) };
  }

  it("a real mp4 is registered as a private recording file and the recording is finished", async () => {
    const { appt, id, key } = await stopped();
    store.arrive(key, MP4);
    expect(await recording.finalize(id)).toBe("stored");
    const [row] = await recordingRows(appt);
    expect(row?.status).toBe("stored");
    const [file] = await rows(
      "SELECT purpose, storage_key, mime_type, size_bytes::int AS size, owner_user_id, patient_id, scan_status FROM files WHERE id = $1",
      [row?.file_id],
    );
    expect(file).toMatchObject({
      purpose: "recording",
      storage_key: key,
      mime_type: "video/mp4",
      size: 5_000_000,
      owner_user_id: doctor.userId,
      patient_id: patientId,
      // Not scanned: the scanner cannot take a file this big, so it is never offered for download.
      scan_status: "pending",
    });
  });

  it("finishing twice changes nothing", async () => {
    const { id, key } = await stopped();
    store.arrive(key, MP4);
    expect(await recording.finalize(id)).toBe("stored");
    expect(await recording.finalize(id)).toBe("skipped");
    expect(await rows("SELECT id FROM files WHERE storage_key = $1", [key])).toHaveLength(1);
  });

  it("a file that has not arrived yet fails the job so the queue retries", async () => {
    const { id } = await stopped();
    await expect(recording.finalize(id)).rejects.toThrow(/not arrived/);
    expect(
      (await rows("SELECT status FROM consultation_recordings WHERE id = $1", [id]))[0]?.status,
    ).toBe("stopped");
  });

  it("something that is not an mp4 is deleted and the recording fails", async () => {
    const { id, key } = await stopped();
    store.arrive(key, EXE);
    expect(await recording.finalize(id)).toBe("rejected");
    expect(store.deleted).toContain(`${BUCKET}/${key}`);
    expect(
      (await rows("SELECT status FROM consultation_recordings WHERE id = $1", [id]))[0]?.status,
    ).toBe("failed");
    expect(await rows("SELECT id FROM files WHERE storage_key = $1", [key])).toHaveLength(0);
  });

  it("an empty or oversize file is deleted and the recording fails", async () => {
    for (const size of [0, 3 * 1024 * 1024 * 1024]) {
      const { id, key } = await stopped();
      store.arrive(key, MP4, size);
      expect(await recording.finalize(id)).toBe("rejected");
      expect(store.deleted).toContain(`${BUCKET}/${key}`);
    }
  });

  it("a recording that is still running is not finished early", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    const [row] = await recordingRows(appt);
    expect(await recording.finalize(String(row?.id))).toBe("skipped");
    expect(await recording.finalize(uuidv7())).toBe("skipped");
  });
});

describe("retention", () => {
  async function stored() {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    await recording.stop(doctor, appt);
    const [row] = await recordingRows(appt);
    store.arrive(String(row?.object_key), MP4);
    await recording.finalize(String(row?.id));
    return { appt, id: String(row?.id), key: String(row?.object_key) };
  }

  it("a recording past its retention date is deleted: the object, then the records; one still inside it stays", async () => {
    const old = await stored();
    const fresh = await stored();
    await q.query(
      "UPDATE consultation_recordings SET retention_until = CURRENT_DATE - 1 WHERE id = $1",
      [old.id],
    );
    const report = await recording.sweep();
    expect(report.deleted).toBe(1);
    expect(store.deleted).toEqual([`${BUCKET}/${old.key}`]);
    expect(store.objects.has(`${BUCKET}/${fresh.key}`)).toBe(true);
    const [gone] = await recordingRows(old.appt);
    expect(gone?.deleted_at).not.toBeNull();
    const [file] = await rows("SELECT deleted_at FROM files WHERE storage_key = $1", [old.key]);
    expect(file?.deleted_at).not.toBeNull();
    expect((await recordingRows(fresh.appt))[0]?.deleted_at).toBeNull();
    // Running it again changes nothing more.
    expect((await recording.sweep()).deleted).toBe(0);
  });

  it("the retention date is today plus the configured days; the day it ends is still inside it", async () => {
    const one = await stored();
    await q.query(
      "UPDATE consultation_recordings SET retention_until = CURRENT_DATE WHERE id = $1",
      [one.id],
    );
    expect((await recording.sweep()).deleted).toBe(0);
  });

  it("a failed recording past its date is cleaned up too, and a running one never is", async () => {
    const appt = await live();
    await agreeBoth(appt);
    await recording.start(doctor, appt);
    await q.query("UPDATE consultation_recordings SET retention_until = CURRENT_DATE - 1");
    expect((await recording.sweep()).deleted).toBe(0);
    await recording.stop(doctor, appt);
    await q.query("UPDATE consultation_recordings SET status = 'failed' WHERE status = 'stopped'");
    expect((await recording.sweep()).deleted).toBeGreaterThanOrEqual(1);
  });

  it("a storage outage keeps the records until the object is really gone", async () => {
    const old = await stored();
    await q.query(
      "UPDATE consultation_recordings SET retention_until = CURRENT_DATE - 1 WHERE id = $1",
      [old.id],
    );
    const real = store.delete.bind(store);
    store.delete = async () => {
      throw new Error("storage down");
    };
    await expect(recording.sweep()).rejects.toThrow(/storage down/);
    expect((await recordingRows(old.appt))[0]?.deleted_at).toBeNull();
    store.delete = real;
    expect((await recording.sweep()).deleted).toBe(1);
  });

  it("a recording that was never stopped is failed after hours, and a file that never arrives is given up on", async () => {
    const runaway = await live();
    await agreeBoth(runaway);
    await recording.start(doctor, runaway);
    await q.query(
      "UPDATE consultation_recordings SET created_at = now() - interval '7 hours' WHERE status = 'recording'",
    );
    const lost = await live();
    await agreeBoth(lost);
    await recording.start(doctor, lost);
    await recording.stop(doctor, lost);
    await q.query(
      "UPDATE consultation_recordings SET stopped_at = now() - interval '25 hours' WHERE status = 'stopped'",
    );
    const report = await recording.sweep();
    expect(report.failed).toBe(2);
    expect((await recordingRows(runaway))[0]?.status).toBe("failed");
    expect((await recordingRows(lost))[0]?.status).toBe("failed");
  });
});

describe("no way around the two agreements", () => {
  it("the database refuses a recording whose agreement was withdrawn after the check", async () => {
    const appt = await live();
    await agreeBoth(appt);
    const repo = new RecordingRepo(q, tx);
    const ctx = await repo.contextByAppointment(appt);
    const policy = await repo.currentPolicy();
    const consents = await repo.liveConsents(String(ctx?.consultationId), String(policy?.id));
    const patientConsent = consents.find((c) => c.userId === patient.userId);
    const doctorConsent = consents.find((c) => c.userId === doctor.userId);
    await repo.withdrawConsent(String(ctx?.consultationId), patient.userId);
    await expect(
      repo.insert({
        id: uuidv7(),
        consultationId: String(ctx?.consultationId),
        patientConsentId: String(patientConsent?.id),
        doctorConsentId: String(doctorConsent?.id),
        objectKey: `recording/2043/${uuidv7()}.mp4`,
        retentionDays: 30,
      }),
    ).rejects.toThrow(/live recording consent/);
  });
});
