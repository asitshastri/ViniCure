import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AccessToken2 } from "agora-token/src/AccessToken2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../db/testing";
import { AgoraProvider } from "../lib/adapters/agora";
import { FakeVideoProvider } from "../lib/adapters/fakes";
import type { VideoProvider } from "../lib/adapters/types";
import { configureApi, resetApiConfig } from "../lib/api/deps";
import { listRoutes } from "../lib/api/registry";
import type { Actor, Role } from "../lib/api/types";
import { Crypto, LocalKeyProvider } from "../lib/crypto/crypto";
import type { PhiAccessEntry } from "../lib/audit/audit";
import type { Queryable, TxRunner } from "../lib/db/queryable";
import { uuidv7 } from "../lib/ids";
import { StorageService, type ObjectStore } from "../lib/storage/storage";
import { ConsentRepo } from "../modules/consent/repo";
import { ConsentService } from "../modules/consent/service";
import { setConsentForTest } from "../modules/consent";
import {
  ConsultationService,
  RecordingService,
  setConsultationsForTest,
  setRecordingForTest,
} from "../modules/consultations";
import { RecordingRepo } from "../modules/consultations/recording-repo";
import { ConsultationRepo } from "../modules/consultations/repo";
import { POST as consentPost } from "../app/api/v1/consultations/[appointmentId]/recording/consent/route";
import { GET as recordingGet } from "../app/api/v1/consultations/[appointmentId]/recording/route";
import { POST as recordingStart } from "../app/api/v1/consultations/[appointmentId]/recording/start/route";
import { POST as recordingStop } from "../app/api/v1/consultations/[appointmentId]/recording/stop/route";
import { POST as recordingWithdraw } from "../app/api/v1/consultations/[appointmentId]/recording/withdraw/route";
import { GET as contextGet } from "../app/api/v1/consultations/[appointmentId]/context/route";
import { POST as endPost } from "../app/api/v1/consultations/[appointmentId]/end/route";
import { POST as joinPost } from "../app/api/v1/consultations/[appointmentId]/join/route";
import { POST as tokenPost } from "../app/api/v1/consultations/[appointmentId]/token/route";

// P6-09: security tests for video consultations. Every case is an attack on the real route
// handlers, with the real services on a real (in-process) Postgres and the real Agora token
// builder. A case that succeeds fails the build. It runs with the rest of `pnpm test`, so it
// runs in CI.
//
// What an attacker might want, and where it is tried below:
//   * to get into someone else's consultation          -> "joining", "the wrong doctor"
//   * to get in outside the booked time                -> "outside the join window"
//   * to stay in after the doctor ended it             -> "after the end"
//   * to learn that a consultation exists              -> "no existence leaks"
//   * to read a token, a room name or a patient's text -> "what leaves the server"
//   * to push work past the gates with odd input       -> "hostile input"
//
// Accepted limit, by design (docs/adr/ADR-008-video.md): a token already handed out keeps working
// at the provider until it expires (one hour at most); ending a consultation stops renewals and
// revokes the seat, it cannot recall a token. That is why tokens are short.

const ORIGIN = "https://vinicure.example";
const MIN = 60_000;
const START = Date.UTC(2044, 2, 5, 10, 0, 0);
const APP_ID = "0123456789abcdef0123456789abcdef"; // secret-scan:allow
const CERT = "fedcba9876543210fedcba9876543210"; // secret-scan:allow
const crypto = new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars"));

let q: Queryable;
let tx: TxRunner;
let nowMs = 0;
let video: VideoProvider;
let rateAllowed = true;
let audits: { route: string; status: number; actorId: string | null }[] = [];
let phi: PhiAccessEntry[] = [];
/** Who each request is from, by a header, so requests made at the same moment keep their own. */
const sessions = new Map<string, Actor>();
let sessionN = 0;
const sessionHeader = (as: Actor | null): Record<string, string> => {
  if (!as) return {};
  const key = `s${++sessionN}`;
  sessions.set(key, as);
  return { "x-test-session": key };
};

type Who = { userId: string; roles: Role[] };
let patient: Who;
let otherPatient: Who;
let doctor: Who;
let otherDoctor: Who;
let admin: Who;
let support: Who;
let superAdmin: Who;
let patientId: string;
let doctorId: string;

const actorOf = (w: Who, over: Partial<Actor> = {}): Actor => ({
  userId: w.userId,
  roles: w.roles,
  sessionId: "session-1",
  lastSignInAt: new Date(),
  ...over,
});

async function person(roles: Role[]): Promise<Who> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
async function doctorRow(user: Who): Promise<string> {
  const id = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,$2,'Dr Secure',$3,'Council','MBBS',$4)`,
    [id, user.userId, `VS-${id.slice(-8)}`, `${id}@example.com`],
  );
  return id;
}
const rows = async (sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows;

let slot = 0;
const starts = new Map<string, number>();
/** A scheduled, paid appointment; the clock is set five minutes before it starts. */
async function booking(over: { paid?: boolean; status?: string } = {}) {
  const appt = uuidv7();
  const start = new Date(START + slot++ * 86_400_000);
  starts.set(appt, start.getTime());
  nowMs = start.getTime() - 5 * MIN;
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,30000, CASE WHEN $7 = 'held' THEN now() + interval '5 minutes' END)`,
    [
      appt,
      patientId,
      doctorId,
      patient.userId,
      start,
      new Date(start.getTime() + 30 * MIN),
      over.status ?? "scheduled",
    ],
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
const clockAt = (appt: string, minutesFromStart: number) => {
  nowMs = (starts.get(appt) as number) + minutesFromStart * MIN;
};

async function agreeToJoinTexts(appt: string) {
  const consent = new ConsentService({ repo: new ConsentRepo(q) });
  const need = await consent.required(asPrincipal(patient), appt);
  await consent.grant(
    asPrincipal(patient),
    appt,
    { policyIds: need.required.map((p) => p.policyId) },
    null,
  );
}
const asPrincipal = (w: Who) => ({ userId: w.userId, roles: w.roles });

type Handler = typeof joinPost;
/** Calls a route handler as the real framework would, with the given session (or none). */
async function call(
  handler: Handler,
  method: "GET" | "POST",
  appointmentId: string,
  as: Actor | null,
  init: { origin?: string; body?: unknown; sameSite?: boolean } = {},
) {
  // A well-formed body, so that who is asking (not the shape of the request) decides the answer.
  const body =
    init.body ??
    (handler === consentPost ? { policyId: "00000000-0000-4000-8000-000000000000" } : {});
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...sessionHeader(as),
  };
  if (init.origin !== "") headers.origin = init.origin ?? ORIGIN;
  if (init.sameSite === false) headers["sec-fetch-site"] = "cross-site";
  const res = await handler(
    new Request(`${ORIGIN}/api/v1/consultations/${encodeURIComponent(appointmentId)}/x`, {
      method,
      headers,
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
    { params: Promise.resolve({ appointmentId }) },
  );
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return { status: res.status, json, text, headers: res.headers };
}
const join = (id: string, w: Who, init = {}) => call(joinPost, "POST", id, actorOf(w), init);
const renew = (id: string, w: Who) => call(tokenPost, "POST", id, actorOf(w));
const end = (id: string, w: Who) => call(endPost, "POST", id, actorOf(w));

const VIDEO_ROUTES: { name: string; handler: Handler; method: "GET" | "POST" }[] = [
  { name: "join", handler: joinPost, method: "POST" },
  { name: "token", handler: tokenPost, method: "POST" },
  { name: "end", handler: endPost, method: "POST" },
  { name: "context", handler: contextGet, method: "GET" },
  { name: "recording state", handler: recordingGet, method: "GET" },
  { name: "recording consent", handler: consentPost, method: "POST" },
  { name: "recording withdraw", handler: recordingWithdraw, method: "POST" },
  { name: "recording start", handler: recordingStart, method: "POST" },
  { name: "recording stop", handler: recordingStop, method: "POST" },
];

/** What the database says about video, so a refused request can be shown to have changed nothing. */
async function footprint() {
  const n = async (sql: string) => Number((await rows(sql))[0]?.n);
  return {
    consultations: await n("SELECT count(*)::int AS n FROM consultations"),
    seats: await n("SELECT count(*)::int AS n FROM consultation_participants"),
    recordings: await n("SELECT count(*)::int AS n FROM consultation_recordings"),
    consents: await n("SELECT count(*)::int AS n FROM user_consents"),
    inProgress: await n("SELECT count(*)::int AS n FROM appointments WHERE status = 'in_progress'"),
  };
}

function open(token: string) {
  const parsed = new AccessToken2();
  expect(parsed.from_string(token)).toBe(true);
  return parsed.services[0] as { __channel_name: Buffer; __uid: Buffer; __privileges: unknown };
}

class NoStore implements ObjectStore {
  async presignPut() {
    return "";
  }
  async presignGet() {
    return "";
  }
  async head() {
    return null;
  }
  async readHead() {
    return new Uint8Array();
  }
  async read() {
    return (async function* () {})();
  }
  async put() {}
  async delete() {}
}

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
  configureApi({
    production: false,
    trustedOrigins: [ORIGIN],
    authenticate: async (request) =>
      sessions.get(request.headers.get("x-test-session") ?? "") ?? null,
    rateLimit: async () =>
      rateAllowed
        ? { allowed: true, limit: 100, remaining: 99, retryAfterSeconds: 0 }
        : { allowed: false, limit: 100, remaining: 0, retryAfterSeconds: 30 },
    audit: async (e) => {
      audits.push({ route: e.route, status: e.status, actorId: e.actorId });
    },
  });
}, 60_000);

afterAll(() => {
  resetApiConfig();
  setConsultationsForTest(undefined);
  setConsentForTest(undefined);
});

let policyN = 0;
beforeEach(async () => {
  slot = 0;
  rateAllowed = true;
  audits = [];
  phi = [];
  sessions.clear();
  video = new AgoraProvider({ appId: APP_ID, appCertificate: CERT, now: () => nowMs });
  const consent = new ConsentService({ repo: new ConsentRepo(q) });
  const service = new ConsultationService({
    repo: new ConsultationRepo(q, tx),
    video: () => video,
    consent,
    appId: () => APP_ID,
    tokenTtlSeconds: () => 3600,
    window: () => ({ earlyMinutes: 10, lateMinutes: 30 }),
    now: () => nowMs,
    crypto: () => crypto,
    phiLog: async (entry) => {
      phi.push(entry);
    },
  });
  setConsentForTest(consent);
  setConsultationsForTest(service);
  setRecordingForTest(
    new RecordingService({
      repo: new RecordingRepo(q, tx),
      video: () => new FakeVideoProvider(),
      enabled: () => true,
      retentionDays: () => 30,
      newKey: () => `recording/2044/${uuidv7()}.mp4`,
      bucket: () => "bucket",
      enqueueStore: async () => undefined,
      storage: () =>
        new StorageService(new NoStore(), {
          buckets: { files: "f", exports: "e", recordings: "r" },
          region: "ap-south-1",
          signedUrlTtlSeconds: 300,
        }),
    }),
  );

  patient = await person(["patient"]);
  otherPatient = await person(["patient"]);
  doctor = await person(["doctor"]);
  otherDoctor = await person(["doctor"]);
  await doctorRow(otherDoctor);
  admin = await person(["admin"]);
  support = await person(["support"]);
  superAdmin = await person(["super_admin"]);
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Secure Patient','1990-01-01','female',false)`,
    [patientId, patient.userId],
  );
  doctorId = await doctorRow(doctor);
  policyN++;
  for (const kind of ["telemedicine", "video", "recording"]) {
    const body = `${kind} ${policyN}`;
    await q.query(
      `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
       VALUES ($1,$2,$3,'en',$4,$5,'2000-01-01')`,
      [
        uuidv7(),
        kind,
        `s${policyN}-${Date.now()}-${kind}`,
        body,
        createHash("sha256").update(body).digest("hex"),
      ],
    );
  }
});

// -------------------------------------------------------------------------------------------
describe("joining: nobody enters a room they do not belong to", () => {
  it("with no session every video route answers 401 and nothing changes", async () => {
    const appt = await booking();
    const before = await footprint();
    for (const r of VIDEO_ROUTES) {
      const res = await call(r.handler, r.method, appt, null);
      expect(res.status, r.name).toBe(401);
    }
    expect(await footprint()).toEqual(before);
  });

  it("another patient, another doctor, an admin, support and a super admin all get the same 404 as for an appointment that does not exist, and no room is made", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const before = await footprint();
    const missing = uuidv7();
    for (const who of [otherPatient, otherDoctor, admin, support, superAdmin]) {
      for (const r of VIDEO_ROUTES) {
        const real = await call(r.handler, r.method, appt, actorOf(who));
        const none = await call(r.handler, r.method, missing, actorOf(who));
        // Same status, same code, same words: nothing tells a real appointment from a made-up one.
        expect(
          [real.status, real.json.code, real.json.detail],
          `${r.name} as ${who.roles}`,
        ).toEqual([none.status, none.json.code, none.json.detail]);
        expect(real.status, `${r.name} as ${who.roles}`).toBe(404);
      }
    }
    expect(await footprint()).toEqual(before);
  });

  it("a patient cannot use the doctor's routes (end, context, recording start and stop) on their own appointment", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    expect((await join(appt, patient)).status).toBe(200);
    expect((await join(appt, doctor)).status).toBe(200);
    for (const r of VIDEO_ROUTES.filter((v) =>
      ["end", "context", "recording start", "recording stop"].includes(v.name),
    )) {
      expect((await call(r.handler, r.method, appt, actorOf(patient))).status, r.name).toBe(404);
    }
    expect(
      (await rows("SELECT status FROM consultations WHERE appointment_id = $1", [appt]))[0]?.status,
    ).toBe("live");
    expect(phi).toHaveLength(0);
  });

  it("the patient and the doctor get a seat of their own: different numbers, one shared room, nobody else's number", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const p = await join(appt, patient);
    const d = await join(appt, doctor);
    expect(p.json.channel).toBe(d.json.channel);
    expect(p.json.uid).not.toBe(d.json.uid);
    expect(p.json.role).toBe("patient");
    expect(d.json.role).toBe("doctor");
    // Renewal gives each person their own number back, never the other's.
    const pr = await renew(appt, patient);
    const dr = await renew(appt, doctor);
    expect(pr.json.uid).toBe(p.json.uid);
    expect(dr.json.uid).toBe(d.json.uid);
  });

  it("the body of a join cannot choose a role, a number, a room or a person", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const res = await join(appt, patient, {
      body: {
        role: "doctor",
        uid: 1,
        channel: "attacker-chosen-room-name-0000000",
        userId: doctor.userId,
        appointmentId: uuidv7(),
        paid: true,
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.role).toBe("patient");
    expect(res.json.uid).not.toBe(1);
    expect(res.json.channel).not.toBe("attacker-chosen-room-name-0000000");
    expect(res.json.appointmentId).toBe(appt);
  });

  it("the patient cannot join an unpaid booking, and nor can the doctor; nothing is created", async () => {
    const appt = await booking({ paid: false });
    await agreeToJoinTexts(appt);
    const before = await footprint();
    const p = await join(appt, patient);
    expect([p.status, p.json.code]).toEqual([403, "forbidden"]);
    const d = await join(appt, doctor);
    expect(d.status).toBe(403);
    expect(await footprint()).toEqual(before);
  });

  it("a booking that is held, cancelled, completed or expired cannot be joined", async () => {
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
      await agreeToJoinTexts(appt);
      const before = await footprint();
      expect((await join(appt, patient)).status, status).toBe(409);
      expect((await join(appt, doctor)).status, status).toBe(409);
      expect(await footprint(), status).toEqual(before);
    }
  });

  it("the patient cannot join without agreeing to the telemedicine and video texts, and is told which", async () => {
    const appt = await booking();
    const before = await footprint();
    const res = await join(appt, patient);
    expect([res.status, res.json.code]).toEqual([403, "consent_required"]);
    expect(JSON.stringify(res.json)).toContain("telemedicine");
    expect(JSON.stringify(res.json)).toContain("video");
    expect(await footprint()).toEqual(before);
  });

  it("a limited session (a recycled number not yet proven) is refused on every video route", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const before = await footprint();
    for (const r of VIDEO_ROUTES) {
      const who = r.name === "join" || r.name === "token" ? patient : doctor;
      const res = await call(r.handler, r.method, appt, actorOf(who, { limited: true }));
      expect([res.status, res.json.code], r.name).toEqual([403, "step_up_required"]);
    }
    expect(await footprint()).toEqual(before);
  });

  it("a request from another site is refused on every state-changing video route, and changes nothing", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const before = await footprint();
    for (const r of VIDEO_ROUTES.filter((v) => v.method === "POST")) {
      for (const init of [
        { origin: "https://evil.example" },
        { origin: "null" },
        { origin: `${ORIGIN}.evil.example` },
        { origin: "http://vinicure.example" },
        { origin: "", sameSite: false },
      ]) {
        const who = r.name === "join" || r.name === "token" ? patient : doctor;
        const res = await call(r.handler, r.method, appt, actorOf(who), init);
        expect(res.status, `${r.name} ${JSON.stringify(init)}`).toBe(403);
      }
    }
    expect(await footprint()).toEqual(before);
  });

  it("a busy rate limiter stops a join with a 429 before anything happens", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const before = await footprint();
    rateAllowed = false;
    for (const r of VIDEO_ROUTES) {
      const who = r.name === "join" || r.name === "token" ? patient : doctor;
      const res = await call(r.handler, r.method, appt, actorOf(who));
      expect(res.status, r.name).toBe(429);
      expect(res.headers.get("retry-after"), r.name).toBeTruthy();
    }
    expect(await footprint()).toEqual(before);
  });
});

// -------------------------------------------------------------------------------------------
describe("the wrong doctor", () => {
  it("a doctor who is not assigned cannot join, renew, end, open the console or touch recording", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    expect((await join(appt, patient)).status).toBe(200);
    expect((await join(appt, doctor)).status).toBe(200);
    const before = await footprint();
    for (const r of VIDEO_ROUTES) {
      const res = await call(r.handler, r.method, appt, actorOf(otherDoctor));
      expect(res.status, r.name).toBe(404);
    }
    expect(await footprint()).toEqual(before);
    expect(phi).toHaveLength(0);
    expect(
      (await rows("SELECT status FROM consultations WHERE appointment_id = $1", [appt]))[0]?.status,
    ).toBe("live");
  });

  it("a doctor who is also a patient elsewhere gets no doctor rights from that", async () => {
    // The other doctor's own patient profile and booking with a different doctor.
    const mine = uuidv7();
    await q.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Doctor As Patient','1985-01-01','male',false)`,
      [mine, otherDoctor.userId],
    );
    const appt = await booking();
    // Their account is not the booking's patient account and not its doctor.
    expect((await join(appt, otherDoctor)).status).toBe(404);
  });

  it("the assigned doctor cannot reach another doctor's appointment either", async () => {
    // An appointment of otherDoctor's own.
    const theirs = uuidv7();
    const theirDoctorId = (
      await rows("SELECT id FROM doctors WHERE user_id = $1", [otherDoctor.userId])
    )[0]?.id;
    const start = new Date(START + 400 * 86_400_000);
    nowMs = start.getTime() - 5 * MIN;
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000)`,
      [
        theirs,
        patientId,
        theirDoctorId,
        patient.userId,
        start,
        new Date(start.getTime() + 30 * MIN),
      ],
    );
    await q.query(
      `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, gateway_payment_id, idempotency_key, captured_at)
       VALUES ($1,$2,$3,30000,'captured',$4,$5,$6, now())`,
      [
        uuidv7(),
        theirs,
        patient.userId,
        `o_${theirs}`,
        `p_${theirs.slice(-12)}`,
        `k-${theirs}-00000`,
      ],
    );
    for (const r of VIDEO_ROUTES) {
      expect((await call(r.handler, r.method, theirs, actorOf(doctor))).status, r.name).toBe(404);
    }
  });

  it("only the assigned doctor ends a consultation; the patient ending it gets 404 and it stays live", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    await join(appt, doctor);
    for (const who of [patient, otherDoctor, admin, support, otherPatient]) {
      expect((await end(appt, who)).status).toBe(404);
    }
    expect((await end(appt, doctor)).status).toBe(200);
  });
});

// -------------------------------------------------------------------------------------------
describe("outside the join window", () => {
  it("is refused before it opens and after it closes, for both people, with nothing created", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const before = await footprint();
    // The window runs from 10 minutes before the start to 30 minutes after the end (30 minutes long).
    for (const minutes of [-10.01, -60, -1440, 60.01, 120, 5000]) {
      clockAt(appt, minutes);
      for (const who of [patient, doctor]) {
        const res = await join(appt, who);
        expect([res.status, res.json.code], `${who.roles} at ${minutes}`).toEqual([
          403,
          "outside_join_window",
        ]);
      }
    }
    expect(await footprint()).toEqual(before);
  });

  it("is open exactly from 10 minutes before the start to 30 minutes after the end, and not a millisecond outside", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    nowMs = (starts.get(appt) as number) - 10 * MIN - 1;
    expect((await join(appt, patient)).status).toBe(403);
    nowMs = (starts.get(appt) as number) - 10 * MIN;
    expect((await join(appt, patient)).status).toBe(200);
    nowMs = (starts.get(appt) as number) + 60 * MIN;
    expect((await join(appt, patient)).status).toBe(200);
    nowMs = (starts.get(appt) as number) + 60 * MIN + 1;
    expect((await join(appt, patient)).status).toBe(403);
  });

  it("the client's clock means nothing: a Date header, an X-Time header or a time in the body change nothing", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    clockAt(appt, -600);
    const res = await joinPost(
      new Request(`${ORIGIN}/api/v1/consultations/${appt}/join`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          ...sessionHeader(actorOf(patient)),
          date: new Date(starts.get(appt) as number).toUTCString(),
          "x-now": String(starts.get(appt)),
        },
        body: JSON.stringify({ now: starts.get(appt), startAt: new Date(0).toISOString() }),
      }),
      { params: Promise.resolve({ appointmentId: appt }) },
    );
    expect(res.status).toBe(403);
  });

  it("a token cannot be renewed long after the booked time, even by someone who is in the room", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    await join(appt, patient);
    clockAt(appt, 60 + 120 - 1);
    expect((await renew(appt, patient)).status).toBe(200);
    clockAt(appt, 60 + 120 + 1);
    expect((await renew(appt, patient)).status).toBe(403);
  });
});

// -------------------------------------------------------------------------------------------
describe("after the end", () => {
  it("renewal is refused for both people, joining again is refused, and the end happens once", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    await join(appt, patient);
    await join(appt, doctor);
    expect((await renew(appt, patient)).status).toBe(200);
    expect((await end(appt, doctor)).status).toBe(200);

    for (const who of [patient, doctor]) {
      const r = await renew(appt, who);
      expect([r.status, r.json.code], `renew ${who.roles}`).toEqual([403, "forbidden"]);
      expect((await join(appt, who)).status, `join ${who.roles}`).toBeGreaterThanOrEqual(403);
      expect((await join(appt, who)).json.token).toBeUndefined();
    }
    expect((await end(appt, doctor)).status).toBe(409);
    // Every seat is revoked in the books.
    const seats = await rows(
      "SELECT revoked_at FROM consultation_participants WHERE consultation_id = (SELECT id FROM consultations WHERE appointment_id = $1)",
      [appt],
    );
    expect(seats).toHaveLength(2);
    for (const s of seats) expect(s.revoked_at).not.toBeNull();
    expect((await rows("SELECT status FROM appointments WHERE id = $1", [appt]))[0]?.status).toBe(
      "completed",
    );
  });

  it("someone who never joined cannot renew, whoever they are", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    for (const who of [patient, doctor, otherDoctor, otherPatient]) {
      expect((await renew(appt, who)).status, `${who.roles}`).toBe(404);
    }
  });

  it("a renewal gives a token no later than an hour away and never a longer life than a join", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const joined = await join(appt, patient);
    clockAt(appt, 20);
    const renewed = await renew(appt, patient);
    for (const res of [joined, renewed]) {
      const expires = new Date(String(res.json.expiresAt)).getTime();
      expect(expires - nowMs).toBeLessThanOrEqual(3_600_000);
      expect(expires - nowMs).toBeGreaterThan(0);
    }
  });

  it("ending before anyone came in abandons it, and nobody can join it afterwards", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    // The doctor opens the room and ends it at once; the patient then finds it closed.
    await join(appt, doctor);
    expect((await end(appt, doctor)).status).toBe(200);
    expect((await join(appt, patient)).status).toBe(409);
  });
});

// -------------------------------------------------------------------------------------------
describe("what leaves the server", () => {
  it("a join answer holds only the room, the person's own number, their token and when it ends", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const res = await join(appt, patient);
    expect(Object.keys(res.json).sort()).toEqual(
      ["appId", "appointmentId", "channel", "expiresAt", "role", "token", "uid"].sort(),
    );
    expect(res.text).not.toContain(CERT);
    expect(res.text).not.toContain(doctor.userId);
    expect(res.text).not.toContain(patient.userId);
    expect(res.text).not.toContain(patientId);
    expect(res.text).not.toContain(doctorId);
    expect(res.headers.get("cache-control") ?? "").toMatch(/no-store|private/);
  });

  it("the room name is random, 32 characters, shares nothing with the appointment or the people, and is never reused", async () => {
    const channels = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const appt = await booking();
      await agreeToJoinTexts(appt);
      const res = await join(appt, patient);
      const channel = String(res.json.channel);
      expect(channel).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(channel).not.toContain(appt.slice(0, 8));
      expect(channel).not.toContain(patient.userId.slice(0, 8));
      channels.add(channel);
    }
    expect(channels.size).toBe(12);
  });

  it("a token is built for exactly this room and this number; another room's or person's token is a different one", async () => {
    const a = await booking();
    const b = await booking();
    await agreeToJoinTexts(a);
    await agreeToJoinTexts(b);
    nowMs = (starts.get(a) as number) - 5 * MIN;
    const ja = await join(a, patient);
    const da = await join(a, doctor);
    nowMs = (starts.get(b) as number) - 5 * MIN;
    const jb = await join(b, patient);
    const ta = open(String(ja.json.token));
    const tb = open(String(jb.json.token));
    const td = open(String(da.json.token));
    expect(String(ta.__channel_name)).toBe(ja.json.channel);
    expect(String(ta.__uid)).toBe(String(ja.json.uid));
    expect(String(tb.__channel_name)).toBe(jb.json.channel);
    expect(String(ta.__channel_name)).not.toBe(String(tb.__channel_name));
    // The doctor's token names the doctor's number, not the patient's.
    expect(String(td.__uid)).toBe(String(da.json.uid));
    expect(String(td.__uid)).not.toBe(String(ta.__uid));
    expect(ja.json.token).not.toBe(da.json.token);
    // The certificate is not in any token.
    for (const t of [ja, da, jb]) {
      expect(String(t.json.token)).not.toContain(CERT);
      expect(Buffer.from(String(t.json.token).slice(3), "base64").toString("latin1")).not.toContain(
        CERT,
      );
    }
  });

  it("provider numbers are positive 32-bit integers, never zero", async () => {
    for (let i = 0; i < 6; i++) {
      const appt = await booking();
      await agreeToJoinTexts(appt);
      const uid = Number((await join(appt, patient)).json.uid);
      expect(Number.isInteger(uid)).toBe(true);
      expect(uid).toBeGreaterThanOrEqual(1);
      expect(uid).toBeLessThanOrEqual(4_294_967_295);
    }
  });

  it("a provider that is down gives a plain 503 with no provider detail, and the same request works afterwards", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const fake = new FakeVideoProvider();
    fake.failures.failNext();
    video = fake;
    const down = await join(appt, patient);
    expect(down.status).toBe(503);
    expect(down.text).not.toMatch(/fake|provider unavailable|stack|at .*\.ts/i);
    expect((await join(appt, patient)).status).toBe(200);
  });

  it("errors never carry a stack, a SQL fragment or a table name", async () => {
    const appt = await booking({ paid: false });
    const bodies: string[] = [];
    for (const r of VIDEO_ROUTES) {
      bodies.push((await call(r.handler, r.method, appt, actorOf(patient))).text);
      bodies.push((await call(r.handler, r.method, appt, actorOf(otherDoctor))).text);
      bodies.push((await call(r.handler, r.method, "nope", actorOf(patient))).text);
    }
    for (const body of bodies) {
      expect(body).not.toMatch(
        /SELECT |INSERT |UPDATE |consultation_participants|node_modules|\.ts:\d+/,
      );
    }
  });

  it("the console shows the patient text only to the assigned doctor, and each read is logged before anything is returned", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    for (const who of [patient, otherDoctor, admin, support, superAdmin, otherPatient]) {
      expect((await call(contextGet, "GET", appt, actorOf(who))).status).toBe(404);
    }
    expect(phi).toHaveLength(0);
    const ok = await call(contextGet, "GET", appt, actorOf(doctor));
    expect(ok.status).toBe(200);
    expect(phi).toHaveLength(1);
    expect(phi[0]).toMatchObject({ actorUserId: doctor.userId, patientId, purpose: "treatment" });
  });

  it("every video route writes an audit line with the person and the result, and never the token", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const res = await join(appt, patient);
    await renew(appt, patient);
    expect(audits.length).toBeGreaterThanOrEqual(2);
    for (const a of audits) {
      expect(a.actorId).toBe(patient.userId);
      expect(JSON.stringify(a)).not.toContain(String(res.json.token));
    }
  });
});

// -------------------------------------------------------------------------------------------
describe("hostile input", () => {
  const HOSTILE = [
    "' OR '1'='1",
    "'; DROP TABLE consultations; --",
    "../../etc/passwd",
    "%2e%2e%2f",
    "<script>alert(1)</script>",
    "${7*7}",
    "a\u0000b",
    "\r\nSet-Cookie: pwned=1",
    "x".repeat(5000),
    "00000000-0000-0000-0000-000000000000",
    "not-a-uuid",
    "",
  ];

  it("a malformed appointment id is refused by every video route as a clean 4xx, never a 500, and changes nothing", async () => {
    const before = await footprint();
    for (const id of HOSTILE) {
      for (const r of VIDEO_ROUTES) {
        for (const who of [patient, doctor]) {
          const res = await call(r.handler, r.method, id, actorOf(who));
          expect(res.status, `${r.name} ${JSON.stringify(id).slice(0, 30)}`).toBeLessThan(500);
          expect(res.status, `${r.name}`).toBeGreaterThanOrEqual(400);
        }
      }
    }
    expect(await footprint()).toEqual(before);
    // The tables are still there.
    expect(await rows("SELECT count(*)::int AS n FROM consultations")).toHaveLength(1);
  });

  it("the recording consent route refuses unknown fields and other shapes of policy id", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    await join(appt, doctor);
    const before = await footprint();
    for (const body of [
      { policyId: uuidv7(), granted: true },
      { policyId: uuidv7(), userId: patient.userId },
      { policyId: "' OR 1=1 --" },
      { policyId: ["a", "b"] },
      { policyId: null },
      {},
      "text",
    ]) {
      const res = await call(consentPost, "POST", appt, actorOf(patient), { body });
      expect([400, 422], JSON.stringify(body)).toContain(res.status);
    }
    expect(await footprint()).toEqual(before);
  });

  it("many joins and renewals at once never make a second room or a second seat", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    const results = await Promise.all([
      ...Array.from({ length: 6 }, () => join(appt, patient)),
      ...Array.from({ length: 6 }, () => join(appt, doctor)),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.json.channel)).size).toBe(1);
    expect(
      await rows("SELECT id FROM consultations WHERE appointment_id = $1", [appt]),
    ).toHaveLength(1);
    expect(
      await rows(
        "SELECT id FROM consultation_participants WHERE consultation_id = (SELECT id FROM consultations WHERE appointment_id = $1)",
        [appt],
      ),
    ).toHaveLength(2);
  });
});

// -------------------------------------------------------------------------------------------
describe("recording cannot be used to get around the join rules", () => {
  it("a stranger, the wrong doctor, an admin and a limited patient cannot agree to, withdraw or start recording", async () => {
    const appt = await booking();
    await agreeToJoinTexts(appt);
    await join(appt, doctor);
    const before = await footprint();
    const policy = (
      await rows(
        "SELECT id FROM consent_policies WHERE kind = 'recording' ORDER BY created_at DESC LIMIT 1",
      )
    )[0]?.id;
    for (const who of [otherPatient, otherDoctor, admin, support]) {
      for (const [handler, init] of [
        [consentPost, { body: { policyId: policy } }],
        [recordingWithdraw, {}],
        [recordingStart, {}],
        [recordingStop, {}],
      ] as const) {
        const res = await call(handler as Handler, "POST", appt, actorOf(who), init);
        expect(res.status).toBe(404);
      }
      expect((await call(recordingGet, "GET", appt, actorOf(who))).status).toBe(404);
    }
    expect(await footprint()).toEqual(before);
  });
});

// -------------------------------------------------------------------------------------------
describe("static guards: the video routes and logs stay locked down", () => {
  const dir = path.resolve(import.meta.dirname, "../app/api/v1/consultations");
  const files = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const f = path.join(d, n);
      return statSync(f).isDirectory() ? files(f) : n === "route.ts" ? [f] : [];
    });

  it("every video route needs a full session, is rate limited, answers 404 to the wrong role and takes a strict appointment id", () => {
    const routes = listRoutes().filter((r) => r.path.startsWith("/api/v1/consultations/"));
    expect(routes.length).toBeGreaterThanOrEqual(VIDEO_ROUTES.length);
    for (const r of routes) {
      const label = `${r.method} ${r.path}`;
      expect(r.auth, label).toBe("session");
      expect(r.fullSession, label).toBe(true);
      expect(r.roleDenied, label).toBe("not_found");
      expect(r.rateLimit, label).toBeTruthy();
      expect(r.roles, label).not.toContain("admin");
      expect(r.roles, label).not.toContain("support");
      expect(r.roles, label).not.toContain("super_admin");
      if (r.method === "POST") expect(r.audited, label).toBe(true);
    }
  });

  it("no video route file reads the request itself: input comes only from the checked params and body", () => {
    for (const file of files(dir)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/request\.(json|text|formData|url|headers)/);
      expect(source, file).not.toMatch(/searchParams/);
    }
  });

  it("logs in the video code never name a token, a room, a number, a certificate or a patient's words", () => {
    const base = path.resolve(import.meta.dirname, "..");
    const sources = [
      "modules/consultations/service.ts",
      "modules/consultations/recording.ts",
      "modules/consultations/repo.ts",
      "modules/consultations/recording-repo.ts",
      "modules/consent/service.ts",
      "lib/adapters/agora.ts",
      "lib/video/agora-client.ts",
    ];
    const forbidden =
      /\b(token|roomRef|room|channel|uid|appId|appCertificate|certificate|reason|patientId|userId|providerUid)\b/;
    for (const rel of sources) {
      const text = readFileSync(path.join(base, rel), "utf8");
      // Each logger.<level>( ... ) call, up to its closing parenthesis and semicolon.
      for (const m of text.matchAll(/logger\.(?:info|warn|error|debug|fatal)\(([\s\S]*?)\);/g)) {
        const call = m[1] ?? "";
        // The event name is the only text a log line may carry about a video call, plus `err`.
        const keys = [...call.matchAll(/(\w+)\s*[:,]/g)].map((k) => k[1] ?? "");
        for (const key of keys) {
          expect(key, `${rel}: logger call ${call.slice(0, 60)}`).not.toMatch(forbidden);
        }
      }
    }
  });

  it("only the join and renew services build a token, and nothing else asks the provider for one", () => {
    const base = path.resolve(import.meta.dirname, "..");
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = path.join(d, n);
        if (statSync(f).isDirectory()) {
          if (n !== "node_modules") walk(f);
        } else if (
          /\.(ts|tsx|mts)$/.test(n) &&
          !/\.test\.|fakes|contract|agora\.ts|types\.ts/.test(n)
        ) {
          if (/\.issueToken\(|video\(\)\.issueToken/.test(readFileSync(f, "utf8")))
            hits.push(path.relative(base, f));
        }
      }
    };
    walk(base);
    expect(hits.map((h) => h.replaceAll("\\", "/"))).toEqual(["modules/consultations/service.ts"]);
  });
});
