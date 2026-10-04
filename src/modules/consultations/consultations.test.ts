import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakeVideoProvider } from "../../lib/adapters/fakes";
import type { PhiAccessEntry } from "../../lib/audit/audit";
import { Crypto, LocalKeyProvider } from "../../lib/crypto/crypto";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import { ConsentRepo } from "../consent/repo";
import { ConsentService } from "../consent/service";
import type { Principal } from "../identity/policy";
import { ConsultationRepo } from "./repo";
import { ConsultationService } from "./service";

// Joining, renewing and ending a video consultation (P6-03, P6-04, P6-05), one check at a time.
let q: Queryable;
let tx: TxRunner;
let video: FakeVideoProvider;
let service: ConsultationService;
let consent: ConsentService;
let nowMs = 0;
let nextUid: (() => number) | undefined;
const crypto = new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars"));
let phi: PhiAccessEntry[] = [];
let phiDown = false;

let patient: Principal;
let doctor: Principal;
let otherDoctor: Principal;
let stranger: Principal;
let admin: Principal;
let support: Principal;
let patientId: string;
let doctorId: string;

const MIN = 60_000;
// Booked for 10:00 to 10:30 on a fixed day, in the far future so the database never minds.
const START = Date.UTC(2041, 5, 10, 10, 0, 0);
const END = START + 30 * MIN;

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
     VALUES ($1,$2,'Dr Video',$3,'Council','MBBS',$4)`,
    [id, user.userId, `VD-${id.slice(-8)}`, `${id}@example.com`],
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

/** A scheduled, paid appointment for the patient and doctor of this test. */
const starts = new Map<string, number>();
/** Moves the clock to five minutes before this appointment, so it is inside its join window. */
const focus = (appt: string) => {
  nowMs = (starts.get(appt) as number) - 5 * MIN;
};
let slot = 0;
async function booking(over: { status?: string; paid?: boolean } = {}) {
  const appt = uuidv7();
  // Each booking of a test gets its own day, so one doctor is never double booked.
  const start = new Date(START + slot++ * 86_400_000);
  const end = new Date(start.getTime() + 30 * MIN);
  starts.set(appt, start.getTime());
  nowMs = start.getTime() - 5 * MIN;
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,30000, CASE WHEN $7 = 'held' THEN now() + interval '5 minutes' END)`,
    [appt, patientId, doctorId, patient.userId, start, end, over.status ?? "scheduled"],
  );
  if (over.paid !== false) {
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
  }
  return appt;
}

let policyN = 0;
async function policies(version = `v${++policyN}-${Date.now()}`, from = "2000-01-01") {
  const ids: Record<string, string> = {};
  for (const kind of ["telemedicine", "video"]) {
    const id = uuidv7();
    const body = `${kind} terms ${version}`;
    await q.query(
      `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
       VALUES ($1,$2,$3,'en',$4,$5,$6)`,
      [id, kind, version, body, createHash("sha256").update(body).digest("hex"), from],
    );
    ids[kind] = id;
  }
  return ids;
}
const agreeAll = async (appt: string) => {
  const need = await consent.required(patient, appt);
  await consent.grant(
    patient,
    appt,
    { policyIds: need.required.map((p) => p.policyId) },
    "203.0.113.7",
  );
};

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
  slot = 0;
  nowMs = START - 5 * MIN; // five minutes before the booked time
  nextUid = undefined;
  video = new FakeVideoProvider();
  consent = new ConsentService({ repo: new ConsentRepo(q) });
  service = new ConsultationService({
    repo: new ConsultationRepo(q, tx),
    video: () => video,
    consent,
    appId: () => "fake_app_id",
    tokenTtlSeconds: () => 3600,
    window: () => ({ earlyMinutes: 10, lateMinutes: 30 }),
    now: () => nowMs,
    newUid: () => (nextUid ? nextUid() : Math.floor(Math.random() * 4_000_000_000) + 1),
    crypto: () => crypto,
    phiLog: async (entry) => {
      if (phiDown) throw new Error("log down");
      phi.push(entry);
    },
  });
  phi = [];
  phiDown = false;
  patient = await person();
  doctor = await person(["doctor"]);
  otherDoctor = await person(["doctor"]);
  await doctorRow(otherDoctor);
  stranger = await person();
  admin = await person(["admin"]);
  support = await person(["support"]);
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Video Patient','1990-01-01','female',false)`,
    [patientId, patient.userId],
  );
  doctorId = await doctorRow(doctor);
  await policies();
});

const decode = (token: string) =>
  JSON.parse(Buffer.from(token, "base64url").toString()) as {
    room: string;
    uid: number;
    role: string;
  };

describe("who may join", () => {
  it("the patient with everything in order gets a token for this room and their own number", async () => {
    const appt = await booking();
    await agreeAll(appt);
    const out = await service.join(patient, appt);
    expect(out).toMatchObject({ appointmentId: appt, role: "patient", appId: "fake_app_id" });
    expect(out.uid).toBeGreaterThan(0);
    expect(decode(out.token)).toMatchObject({ room: out.channel, uid: out.uid });
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // The room name is random: it contains neither the appointment id nor anything about the people.
    expect(out.channel).not.toContain(appt);
    expect(out.channel).not.toContain(patient.userId);
  });

  it("the assigned doctor joins, which starts the consultation and the appointment", async () => {
    const appt = await booking();
    const out = await service.join(doctor, appt);
    expect(out.role).toBe("doctor");
    const c = (
      await rows("SELECT status, started_at FROM consultations WHERE appointment_id=$1", [appt])
    )[0];
    expect(c?.status).toBe("live");
    expect(c?.started_at).not.toBeNull();
    expect((await rows("SELECT status FROM appointments WHERE id=$1", [appt]))[0]?.status).toBe(
      "in_progress",
    );
    const history = await rows(
      "SELECT from_status, to_status, reason FROM appointment_status_history WHERE appointment_id=$1 AND to_status='in_progress'",
      [appt],
    );
    expect(history).toHaveLength(1);
  });

  it("the patient and the doctor share one room and have different numbers; coming back gives the same seat", async () => {
    const appt = await booking();
    await agreeAll(appt);
    const a = await service.join(patient, appt);
    const b = await service.join(doctor, appt);
    expect(a.channel).toBe(b.channel);
    expect(a.uid).not.toBe(b.uid);
    const again = await service.join(patient, appt);
    expect(again.uid).toBe(a.uid);
    expect(again.channel).toBe(a.channel);
    expect(await rows("SELECT id FROM consultations WHERE appointment_id=$1", [appt])).toHaveLength(
      1,
    );
    expect(
      await rows(
        "SELECT id FROM consultation_participants WHERE consultation_id=(SELECT id FROM consultations WHERE appointment_id=$1)",
        [appt],
      ),
    ).toHaveLength(2);
  });

  it("two appointments never share a room", async () => {
    const a = await booking();
    const b = await booking();
    focus(a);
    const ra = (await service.join(doctor, a)).channel;
    focus(b);
    const rb = (await service.join(doctor, b)).channel;
    expect(ra).not.toBe(rb);
  });

  it("anyone else gets the same answer as for an appointment that does not exist, and no room is made", async () => {
    const appt = await booking();
    await agreeAll(appt);
    for (const who of [stranger, otherDoctor, admin, support]) {
      expect(await code(service.join(who, appt)), who.roles.join()).toBe("not_found");
    }
    expect(await code(service.join(patient, uuidv7()))).toBe("not_found");
    expect(await rows("SELECT id FROM consultations WHERE appointment_id=$1", [appt])).toHaveLength(
      0,
    );
  });

  it("a limited session (second method not proven) cannot join", async () => {
    const appt = await booking();
    await agreeAll(appt);
    expect(await code(service.join({ ...patient, limited: true }, appt))).toBe("step_up_required");
  });
});

describe("payment", () => {
  it("the patient cannot join an appointment that is not paid, and no room is made", async () => {
    const appt = await booking({ paid: false });
    await agreeAll(appt);
    expect(await code(service.join(patient, appt))).toBe("forbidden");
    expect(await rows("SELECT id FROM consultations WHERE appointment_id=$1", [appt])).toHaveLength(
      0,
    );
  });

  it("nor the doctor: nobody enters a room for an unpaid booking", async () => {
    const appt = await booking({ paid: false });
    expect(await code(service.join(doctor, appt))).toBe("forbidden");
  });

  it("only a payment that holds money counts: a created, failed or fully refunded one does not", async () => {
    for (const status of ["created", "failed"]) {
      const appt = await booking({ paid: false });
      await q.query(
        `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, idempotency_key)
         VALUES ($1,$2,$3,30000,$4,$5,$6)`,
        [uuidv7(), appt, patient.userId, status, `order_${appt}`, `key-${appt}-0000001`],
      );
      expect(await code(service.join(doctor, appt)), status).toBe("forbidden");
    }
    const refunded = await booking({ paid: false });
    await q.query(
      `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, amount_refunded_paise, status, gateway_order_id, gateway_payment_id, idempotency_key, captured_at)
       VALUES ($1,$2,$3,30000,30000,'refunded',$4,$5,$6, now())`,
      [
        uuidv7(),
        refunded,
        patient.userId,
        `order_${refunded}`,
        `pay_${refunded.slice(-12)}`,
        `key-${refunded}-0000002`,
      ],
    );
    expect(await code(service.join(doctor, refunded))).toBe("forbidden");
  });
});

describe("the join window", () => {
  it("opens ten minutes before the booked time and closes thirty minutes after it ends, for both people", async () => {
    const appt = await booking();
    await agreeAll(appt);
    for (const who of [patient, doctor]) {
      nowMs = START - 10 * MIN - 1;
      expect(await code(service.join(who, appt)), `${who.roles[0]} early`).toMatch(
        /^(outside_join_window|forbidden)$/,
      );
      nowMs = START - 10 * MIN;
      expect(await code(service.join(who, appt)), `${who.roles[0]} opens`).toBe("ok");
      nowMs = END + 30 * MIN;
      expect(await code(service.join(who, appt)), `${who.roles[0]} last minute`).toBe("ok");
      nowMs = END + 30 * MIN + 1;
      expect(await code(service.join(who, appt)), `${who.roles[0]} late`).toMatch(
        /^(outside_join_window|forbidden)$/,
      );
    }
  });

  it("outside the window the answer says so, and no room is made", async () => {
    const appt = await booking();
    await agreeAll(appt);
    nowMs = START - 3 * 60 * MIN;
    expect(await code(service.join(doctor, appt))).toBe("outside_join_window");
    expect(await code(service.join(patient, appt))).toBe("outside_join_window");
    expect(await rows("SELECT id FROM consultations WHERE appointment_id=$1", [appt])).toHaveLength(
      0,
    );
  });

  it("only a booked appointment can be joined: not held, cancelled, completed, expired or a no-show", async () => {
    for (const status of [
      "held",
      "cancelled_by_patient",
      "cancelled_by_doctor",
      "cancelled_by_admin",
      "completed",
      "expired",
      "no_show",
    ]) {
      const appt = await booking({ status });
      if (status === "held") {
        await q.query(
          "UPDATE appointments SET hold_expires_at = now() + interval '5 minutes' WHERE id=$1",
          [appt],
        );
      }
      await agreeAll(appt);
      expect(await code(service.join(patient, appt)), status).toBe("conflict");
      expect(await code(service.join(doctor, appt)), status).toBe("conflict");
    }
  });
});

describe("consent", () => {
  it("the patient cannot join without agreeing to both texts, and is told which", async () => {
    const appt = await booking();
    const error = await service.join(patient, appt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("consent_required");
    expect((error as AppError).issues?.map((i) => i.message).sort()).toEqual([
      "telemedicine",
      "video",
    ]);
    expect(await rows("SELECT id FROM consultations WHERE appointment_id=$1", [appt])).toHaveLength(
      0,
    );
  });

  it("agreeing to only one of the two is not enough", async () => {
    const appt = await booking();
    const need = await consent.required(patient, appt);
    await consent.grant(patient, appt, { policyIds: [need.required[0]!.policyId] }, null);
    expect(await code(service.join(patient, appt))).toBe("consent_required");
    expect((await consent.required(patient, appt)).required).toHaveLength(1);
  });

  it("after agreeing the patient can join; the agreement is stored with the exact text and the address", async () => {
    const appt = await booking();
    await agreeAll(appt);
    expect(await code(service.join(patient, appt))).toBe("ok");
    const stored = await rows(
      `SELECT uc.user_id, uc.patient_id, uc.given_by_user_id, host(uc.ip) AS ip, pc.kind
         FROM user_consents uc JOIN consent_policies pc ON pc.id = uc.policy_id WHERE uc.user_id=$1`,
      [patient.userId],
    );
    expect(stored.map((r) => r.kind).sort()).toEqual(["telemedicine", "video"]);
    expect(stored[0]).toMatchObject({
      patient_id: patientId,
      given_by_user_id: null,
      ip: "203.0.113.7",
    });
  });

  it("the doctor does not need the patient's agreement to enter", async () => {
    const appt = await booking();
    expect(await code(service.join(doctor, appt))).toBe("ok");
  });

  it("withdrawing closes the join again until the patient agrees again", async () => {
    const appt = await booking();
    await agreeAll(appt);
    expect(await code(service.join(patient, appt))).toBe("ok");
    const live = await rows(
      "SELECT id FROM user_consents WHERE user_id=$1 AND withdrawn_at IS NULL",
      [patient.userId],
    );
    await consent.withdraw(patient, String(live[0]?.id));
    expect(await code(service.join(patient, appt))).toBe("consent_required");
    await agreeAll(appt);
    expect(await code(service.join(patient, appt))).toBe("ok");
  });

  it("a new version of a text is asked for again; an old agreement does not carry over", async () => {
    const appt = await booking();
    await agreeAll(appt);
    expect(await code(service.join(patient, appt))).toBe("ok");
    await policies(`v-new-${Date.now()}`, "2001-01-01");
    expect(await code(service.join(patient, appt))).toBe("consent_required");
  });

  it("a text that has not started yet is not asked for", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await policies(`v-future-${Date.now()}`, "2999-01-01");
    expect(await code(service.join(patient, appt))).toBe("ok");
  });

  it("with no text in force at all, video stays closed and says so", async () => {
    // A fresh database would have none; here a kind nobody has a text for stands in for that.
    const appt = await booking();
    await agreeAll(appt);
    const closed = new ConsentService({
      repo: {
        ...new ConsentRepo(q),
        currentPolicies: async () => [],
        liveConsents: async () => [],
      } as unknown as ConsentRepo,
    });
    const svc = new ConsultationService({
      repo: new ConsultationRepo(q, tx),
      video: () => video,
      consent: closed,
      appId: () => "x",
      tokenTtlSeconds: () => 3600,
      window: () => ({ earlyMinutes: 10, lateMinutes: 30 }),
      now: () => nowMs,
    });
    expect(await code(svc.join(patient, appt))).toBe("unavailable");
  });

  it("only the account that owns the patient can see or give the agreements; only the current texts can be agreed to", async () => {
    const appt = await booking();
    for (const who of [stranger, doctor, admin, support]) {
      expect(await code(consent.required(who, appt)), who.roles.join()).toBe("not_found");
      expect(await code(consent.grant(who, appt, { policyIds: [uuidv7()] }, null))).toBe(
        "not_found",
      );
    }
    const old = await policies(`v-old-${Date.now()}`, "1999-01-01");
    expect(await code(consent.grant(patient, appt, { policyIds: [old.video!] }, null))).toBe(
      "validation_failed",
    );
    expect(await code(consent.grant(patient, appt, { policyIds: [uuidv7()] }, null))).toBe(
      "validation_failed",
    );
  });

  it("a parent agreeing for a child is recorded as given by the parent", async () => {
    const child = uuidv7();
    await q.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'child','Young Patient','2018-01-01','male',true)`,
      [child, patient.userId],
    );
    const appt = uuidv7();
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000)`,
      [appt, child, doctorId, patient.userId, new Date(START), new Date(END)],
    );
    await agreeAll(appt);
    const stored = await rows(
      "SELECT given_by_user_id, patient_id FROM user_consents WHERE patient_id=$1",
      [child],
    );
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ given_by_user_id: patient.userId });
  });

  it("someone else's agreement cannot be withdrawn", async () => {
    const appt = await booking();
    await agreeAll(appt);
    const live = String(
      (await rows("SELECT id FROM user_consents WHERE user_id=$1", [patient.userId]))[0]?.id,
    );
    expect(await code(consent.withdraw(stranger, live))).toBe("not_found");
    expect(await code(consent.withdraw(patient, uuidv7()))).toBe("not_found");
    expect(await code(consent.withdraw(patient, live))).toBe("ok");
    expect(await code(consent.withdraw(patient, live))).toBe("conflict");
  });
});

describe("provider numbers and the provider", () => {
  it("a number already taken in the room is replaced by another", async () => {
    const appt = await booking();
    await agreeAll(appt);
    const seq = [777, 777, 888];
    nextUid = () => seq.shift() as number;
    const a = await service.join(patient, appt);
    const b = await service.join(doctor, appt);
    expect(a.uid).toBe(777);
    expect(b.uid).toBe(888);
  });

  it("a video provider that is down is 'unavailable', and the same request works afterwards", async () => {
    const appt = await booking();
    video.failures.failNext(1);
    expect(await code(service.join(doctor, appt))).toBe("unavailable");
    expect(await code(service.join(doctor, appt))).toBe("ok");
    expect(await rows("SELECT id FROM consultations WHERE appointment_id=$1", [appt])).toHaveLength(
      1,
    );
  });

  it("no answer carries more than the room, the person's own number and their token", async () => {
    const appt = await booking();
    const out = await service.join(doctor, appt);
    expect(Object.keys(out).sort()).toEqual([
      "appId",
      "appointmentId",
      "channel",
      "expiresAt",
      "role",
      "token",
      "uid",
    ]);
  });
});

describe("renewing a token", () => {
  it("someone in the room gets a new token for the same room and number", async () => {
    const appt = await booking();
    await agreeAll(appt);
    const first = await service.join(patient, appt);
    nowMs += 50 * MIN;
    const next = await service.renew(patient, appt);
    expect(next.uid).toBe(first.uid);
    expect(next.channel).toBe(first.channel);
    expect(decode(next.token)).toMatchObject({ room: first.channel, uid: first.uid });
  });

  it("someone who never joined, and anyone else, gets a 404", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(doctor, appt);
    expect(await code(service.renew(patient, appt))).toBe("not_found");
    for (const who of [stranger, otherDoctor, admin, support]) {
      expect(await code(service.renew(who, appt)), who.roles.join()).toBe("not_found");
    }
  });

  it("is refused once the doctor has ended the consultation, for both people", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(patient, appt);
    await service.join(doctor, appt);
    expect(await code(service.renew(patient, appt))).toBe("ok");
    await service.end(doctor, appt);
    expect(await code(service.renew(patient, appt))).toBe("forbidden");
    expect(await code(service.renew(doctor, appt))).toBe("forbidden");
    // Nor can anyone join again.
    expect(await code(service.join(patient, appt))).toBe("conflict");
    expect(await code(service.join(doctor, appt))).toBe("conflict");
  });

  it("is refused for a revoked seat even if the consultation is still open", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(patient, appt);
    await q.query("UPDATE consultation_participants SET revoked_at = now() WHERE user_id=$1", [
      patient.userId,
    ]);
    expect(await code(service.renew(patient, appt))).toBe("forbidden");
    expect(await code(service.join(patient, appt))).toBe("forbidden");
  });

  it("is refused when the appointment was cancelled, and long after the booked time", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(patient, appt);
    nowMs = END + 30 * MIN + 120 * MIN + 1;
    expect(await code(service.renew(patient, appt))).toBe("forbidden");
    nowMs = START;
    expect(await code(service.renew(patient, appt))).toBe("ok");
    await q.query("UPDATE appointments SET status='cancelled_by_admin' WHERE id=$1", [appt]);
    expect(await code(service.renew(patient, appt))).toBe("forbidden");
  });
});

describe("ending", () => {
  it("the doctor ends it: the consultation is ended, the visit completed, every seat revoked", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(patient, appt);
    await service.join(doctor, appt);
    expect(await service.end(doctor, appt)).toEqual({ status: "ended" });
    const c = (
      await rows("SELECT status, ended_at FROM consultations WHERE appointment_id=$1", [appt])
    )[0];
    expect(c?.status).toBe("ended");
    expect(c?.ended_at).not.toBeNull();
    expect((await rows("SELECT status FROM appointments WHERE id=$1", [appt]))[0]?.status).toBe(
      "completed",
    );
    const seats = await rows(
      "SELECT revoked_at, left_at FROM consultation_participants WHERE consultation_id=(SELECT id FROM consultations WHERE appointment_id=$1)",
      [appt],
    );
    expect(seats).toHaveLength(2);
    for (const s of seats) {
      expect(s.revoked_at).not.toBeNull();
      expect(s.left_at).not.toBeNull();
    }
    expect(
      await rows(
        "SELECT reason FROM appointment_status_history WHERE appointment_id=$1 AND to_status='completed'",
        [appt],
      ),
    ).toHaveLength(1);
  });

  it("ending twice is refused the second time and changes nothing", async () => {
    const appt = await booking();
    await service.join(doctor, appt);
    await service.end(doctor, appt);
    expect(await code(service.end(doctor, appt))).toBe("conflict");
    expect(
      await rows(
        "SELECT id FROM appointment_status_history WHERE appointment_id=$1 AND to_status='completed'",
        [appt],
      ),
    ).toHaveLength(1);
  });

  it("only the assigned doctor can end it; the patient, another doctor, an admin and support get a 404", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(doctor, appt);
    for (const who of [patient, stranger, otherDoctor, admin, support]) {
      expect(await code(service.end(who, appt)), who.roles.join()).toBe("not_found");
    }
    expect(
      (await rows("SELECT status FROM consultations WHERE appointment_id=$1", [appt]))[0]?.status,
    ).toBe("live");
  });

  it("with no consultation yet there is nothing to end", async () => {
    const appt = await booking();
    expect(await code(service.end(doctor, appt))).toBe("conflict");
  });

  it("ending before the doctor ever came in abandons it and leaves the visit booked", async () => {
    const appt = await booking();
    await agreeAll(appt);
    await service.join(patient, appt);
    expect(await service.end(doctor, appt)).toEqual({ status: "abandoned" });
    expect((await rows("SELECT status FROM appointments WHERE id=$1", [appt]))[0]?.status).toBe(
      "scheduled",
    );
    expect(await code(service.renew(patient, appt))).toBe("forbidden");
  });
});

describe("the doctor's console", () => {
  async function withReason(text: string | null, over: { minor?: boolean } = {}) {
    const appt = await booking();
    const enc = text === null ? null : await crypto.encrypt(text, "appointments.reason_enc");
    await q.query("UPDATE appointments SET reason_enc=$2 WHERE id=$1", [appt, enc]);
    if (over.minor) {
      await q.query(
        "UPDATE patients SET is_minor=true, dob='2018-02-01', relation='child' WHERE id=$1",
        [patientId],
      );
      await q.query(
        "UPDATE appointments SET attending_adult_name='Parent Name', attending_adult_relation='mother' WHERE id=$1",
        [appt],
      );
    }
    return appt;
  }

  it("the assigned doctor sees the patient and the reason they wrote, and the read is logged first", async () => {
    const appt = await withReason("Fever and cough for two days");
    const out = await service.console(doctor, appt);
    expect(out).toMatchObject({
      appointmentId: appt,
      status: "scheduled",
      reason: "Fever and cough for two days",
      patient: {
        name: "Video Patient",
        sex: "female",
        relation: "self",
        isMinor: false,
        attendingAdult: null,
      },
      doctor: {
        name: "Dr Video",
        registrationNo: expect.stringMatching(/^VD-/),
        council: "Council",
      },
    });
    expect(out.patient.ageYears).toBeGreaterThan(30);
    expect(phi).toEqual([
      {
        actorUserId: doctor.userId,
        patientId,
        resourceType: "patient_summary",
        resourceId: appt,
        purpose: "treatment",
      },
    ]);
  });

  it("every read writes its own log entry", async () => {
    const appt = await withReason("Headache");
    await service.console(doctor, appt);
    await service.console(doctor, appt);
    expect(phi).toHaveLength(2);
  });

  it("if the log cannot be written, nothing is returned", async () => {
    const appt = await withReason("Private reason");
    phiDown = true;
    const error = await service.console(doctor, appt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(JSON.stringify(error)).not.toContain("Private reason");
    expect(phi).toHaveLength(0);
  });

  it("a child shows the adult who will attend", async () => {
    const appt = await withReason("Rash", { minor: true });
    // Ages are worked out from the clock; use today's so a child born in 2018 is still a child.
    nowMs = Date.now();
    const out = await service.console(doctor, appt);
    expect(out.patient).toMatchObject({
      isMinor: true,
      relation: "child",
      attendingAdult: { name: "Parent Name", relation: "mother" },
    });
    expect(out.patient.ageYears).toBeLessThan(18);
  });

  it("no reason written is null, not an empty guess", async () => {
    const appt = await withReason(null);
    expect((await service.console(doctor, appt)).reason).toBeNull();
  });

  it("only the assigned doctor; the patient, another doctor, an admin, support and a stranger get 404 and nothing is logged", async () => {
    const appt = await withReason("Secret");
    for (const who of [patient, otherDoctor, admin, support, stranger]) {
      expect(await code(service.console(who, appt)), who.roles.join()).toBe("not_found");
    }
    expect(await code(service.console(doctor, uuidv7()))).toBe("not_found");
    expect(phi).toHaveLength(0);
  });

  it("a limited session cannot open it", async () => {
    const appt = await withReason("Secret");
    expect(await code(service.console({ ...doctor, limited: true }, appt))).toBe(
      "step_up_required",
    );
    expect(phi).toHaveLength(0);
  });

  it("a closed appointment cannot be opened: cancelled, completed, expired", async () => {
    for (const status of ["cancelled_by_patient", "completed", "expired"]) {
      const appt = await booking({ status });
      expect(await code(service.console(doctor, appt)), status).toBe("conflict");
    }
    expect(phi).toHaveLength(0);
  });

  it("the answer holds only what the screen needs: no contact details, no account ids", async () => {
    const appt = await withReason("Cough");
    const text = JSON.stringify(await service.console(doctor, appt));
    for (const leak of [patient.userId, doctor.userId, "@no-email", "phone", "dob", "1990-01-01"]) {
      expect(text, leak).not.toContain(leak);
    }
  });
});
