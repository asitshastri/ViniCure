import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { MemoryCache } from "../../lib/cache";
import { Crypto, LocalKeyProvider } from "../../lib/crypto/crypto";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import type { Principal } from "../identity/policy";
import { PatientRepo } from "../patients/repo";
import {
  AppointmentService,
  appointmentsQuery,
  cancelBody,
  holdBody,
  rescheduleBody,
} from "./appointments";
import { AppointmentRepo } from "./appointments-repo";
import { SchedulingRepo } from "./repo";
import { SlotService } from "./service";
import {
  CANCEL_REASONS,
  MAX_RESCHEDULES,
  STATUSES,
  canMove,
  cancelStatusFor,
  isFinal,
} from "./state";

// The doctor works Mondays 09:00-12:00 in 30 minute slots; "now" for slot generation is Sunday 1 Nov 2026.
const NOW = new Date("2026-11-01T10:00:00+05:30");
const SLOT = (hhmm: string, date = "2026-11-02") =>
  new Date(`${date}T${hhmm}:00+05:30`).toISOString();
const crypto = new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars"));

let q: Queryable;
let service: AppointmentService;
let doctorId: string;
let doctor: Principal;
let otherDoctor: Principal;
let admin: Principal;
let support: Principal;
let asha: Principal;
let ashaPatient: string;
let ravi: Principal;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
async function person(roles: Role[] = ["patient"]): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
async function profile(owner: Principal) {
  const id = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [id, owner.userId],
  );
  return id;
}
/** A confirmed appointment (as if paid), held first through the service. */
async function confirmed(startAt = SLOT("09:00"), who = asha, patientId = ashaPatient) {
  const view = await service.hold(who, holdBody.parse({ patientId, doctorId, startAt }));
  await q.query("UPDATE appointments SET status='scheduled', hold_expires_at=NULL WHERE id=$1", [
    view.id,
  ]);
  return view.id;
}
const status = async (id: string) =>
  String((await q.query("SELECT status FROM appointments WHERE id=$1", [id])).rows[0]?.status);
const history = async (id: string) =>
  (
    await q.query(
      "SELECT from_status, to_status, reason, changed_by FROM appointment_status_history WHERE appointment_id=$1 ORDER BY id",
      [id],
    )
  ).rows;

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (t, p) => ({ rows: (await pg.db.query(t, p)).rows as Record<string, unknown>[] }),
  };
}, 60_000);

beforeEach(async () => {
  const repo = new AppointmentRepo(q);
  const slots = new SlotService({
    repo: new SchedulingRepo(q),
    cache: () => new MemoryCache(),
    env: "test",
    now: () => NOW,
    booked: (d, f, t) => repo.activeIntervals(d, f, t),
  });
  service = new AppointmentService({
    repo,
    patients: new PatientRepo(q),
    slots,
    crypto: () => crypto,
  });
  doctor = await person(["doctor"]);
  otherDoctor = await person(["doctor"]);
  admin = await person(["admin"]);
  support = await person(["support"]);
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status) VALUES ($1,$2,'Dr Life',$3,'Council','MBBS',45000,'approved','active')`,
    [doctorId, doctor.userId, `L-${doctorId.slice(-8)}`],
  );
  await q.query(
    `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
     VALUES ($1,$2,1,'09:00','12:00',30,'2026-01-01')`,
    [uuidv7(), doctorId],
  );
  asha = await person();
  ashaPatient = await profile(asha);
  ravi = await person();
});

describe("the state table", () => {
  it("allows exactly the documented moves", () => {
    const allowed: [string, string][] = [
      ["held", "scheduled"],
      ["held", "expired"],
      ["held", "cancelled_by_patient"],
      ["scheduled", "in_progress"],
      ["scheduled", "cancelled_by_patient"],
      ["scheduled", "cancelled_by_doctor"],
      ["scheduled", "cancelled_by_admin"],
      ["scheduled", "no_show"],
      ["in_progress", "completed"],
    ];
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(canMove(from, to), `${from} -> ${to}`).toBe(
          allowed.some(([a, b]) => a === from && b === to),
        );
      }
    }
  });

  it("final states go nowhere, and unknown names are never allowed", () => {
    for (const s of [
      "completed",
      "cancelled_by_patient",
      "cancelled_by_doctor",
      "cancelled_by_admin",
      "expired",
      "no_show",
    ]) {
      expect(isFinal(s), s).toBe(true);
    }
    expect(isFinal("held")).toBe(false);
    expect(canMove("held", "anything")).toBe(false);
    expect(canMove("whatever", "scheduled")).toBe(false);
    expect(cancelStatusFor("patient")).toBe("cancelled_by_patient");
    expect(cancelStatusFor("doctor")).toBe("cancelled_by_doctor");
    expect(cancelStatusFor("admin")).toBe("cancelled_by_admin");
  });

  it("the database accepts only the listed statuses", async () => {
    const id = await confirmed();
    await expect(
      q.query("UPDATE appointments SET status='teleported' WHERE id=$1", [id]),
    ).rejects.toThrow(/appointments_status_check/);
  });
});

describe("cancelling", () => {
  it("the patient's account cancels: final status, history, and the slot is free again", async () => {
    const id = await confirmed();
    const view = await service.cancel(asha, id, { reason: "changed_mind" });
    expect(view.status).toBe("cancelled_by_patient");
    // The test confirmed the booking directly in SQL, so only the service's own moves are logged.
    expect((await history(id)).map((h) => [h.from_status, h.to_status, h.reason])).toEqual([
      [null, "held", null],
      ["scheduled", "cancelled_by_patient", "changed_mind"],
    ]);
    // Another patient can now take the slot.
    const ravisProfile = await profile(ravi);
    expect(
      (
        await service.hold(
          ravi,
          holdBody.parse({ patientId: ravisProfile, doctorId, startAt: SLOT("09:00") }),
        )
      ).status,
    ).toBe("held");
  });

  it("the assigned doctor and an admin cancel with their own final status", async () => {
    const a = await confirmed(SLOT("09:00"));
    expect((await service.cancel(doctor, a, { reason: "doctor_unavailable" })).status).toBe(
      "cancelled_by_doctor",
    );
    const b = await confirmed(SLOT("09:30"));
    expect((await service.cancel(admin, b, { reason: "other" })).status).toBe("cancelled_by_admin");
  });

  it("a patient can release a hold before paying", async () => {
    const view = await service.hold(
      asha,
      holdBody.parse({ patientId: ashaPatient, doctorId, startAt: SLOT("09:00") }),
    );
    expect((await service.cancel(asha, view.id, { reason: "booked_by_mistake" })).status).toBe(
      "cancelled_by_patient",
    );
    expect(
      (await q.query("SELECT hold_expires_at FROM appointments WHERE id=$1", [view.id])).rows[0]
        ?.hold_expires_at,
    ).toBeNull();
  });

  it("everyone else gets 404: another patient, another doctor, support, and a missing id", async () => {
    const id = await confirmed();
    for (const who of [ravi, otherDoctor, support]) {
      expect(await code(service.cancel(who, id, { reason: "other" })), who.roles.join()).toBe(
        "not_found",
      );
    }
    expect(await code(service.cancel(asha, uuidv7(), { reason: "other" }))).toBe("not_found");
    expect(await status(id)).toBe("scheduled");
  });

  it("a doctor cannot cancel a hold, and nobody cancels twice or after the end", async () => {
    const held = await service.hold(
      asha,
      holdBody.parse({ patientId: ashaPatient, doctorId, startAt: SLOT("09:00") }),
    );
    expect(await code(service.cancel(doctor, held.id, { reason: "other" }))).toBe("conflict");
    const id = await confirmed(SLOT("09:30"));
    await service.cancel(asha, id, { reason: "other" });
    expect(await code(service.cancel(asha, id, { reason: "other" }))).toBe("conflict");
    expect(await code(service.cancel(admin, id, { reason: "other" }))).toBe("conflict");
    for (const done of ["completed", "no_show", "expired"]) {
      const x = await confirmed(SLOT("10:00"), asha);
      await q.query("UPDATE appointments SET status=$2 WHERE id=$1", [x, done]);
      expect(await code(service.cancel(asha, x, { reason: "other" })), done).toBe("conflict");
      await q.query("UPDATE appointments SET status='cancelled_by_admin' WHERE id=$1", [x]);
    }
  });

  it("an appointment whose time has come cannot be cancelled", async () => {
    const id = await confirmed();
    await q.query(
      "UPDATE appointments SET start_at = now() - interval '5 minutes', end_at = now() + interval '25 minutes' WHERE id=$1",
      [id],
    );
    expect(await code(service.cancel(asha, id, { reason: "other" }))).toBe("conflict");
    expect(await code(service.cancel(admin, id, { reason: "other" }))).toBe("conflict");
  });

  it("the reason is a fixed list: free text is refused", () => {
    expect(cancelBody.safeParse({ reason: "I have chest pain and cannot come" }).success).toBe(
      false,
    );
    expect(cancelBody.safeParse({}).success).toBe(false);
    expect(cancelBody.safeParse({ reason: "other", extra: 1 }).success).toBe(false);
    for (const r of CANCEL_REASONS) expect(cancelBody.safeParse({ reason: r }).success).toBe(true);
  });
});

describe("rescheduling", () => {
  it("moves a confirmed appointment to another free slot, frees the old one, and logs it", async () => {
    const id = await confirmed(SLOT("09:00"));
    const view = await service.reschedule(asha, id, { startAt: SLOT("10:00") });
    expect(view).toMatchObject({
      status: "scheduled",
      startAt: SLOT("10:00"),
      endAt: SLOT("10:30"),
      rescheduleCount: 1,
      feePaise: 45000,
    });
    expect((await history(id)).some((h) => h.reason === "rescheduled")).toBe(true);
    const ravisProfile = await profile(ravi);
    expect(
      (
        await service.hold(
          ravi,
          holdBody.parse({ patientId: ravisProfile, doctorId, startAt: SLOT("09:00") }),
        )
      ).status,
    ).toBe("held");
  });

  it("refuses a taken slot, a non-slot, and the same slot", async () => {
    const id = await confirmed(SLOT("09:00"));
    await confirmed(SLOT("10:00"), ravi, await profile(ravi));
    expect(await code(service.reschedule(asha, id, { startAt: SLOT("10:00") }))).toBe("slot_taken");
    expect(await code(service.reschedule(asha, id, { startAt: SLOT("10:15") }))).toBe("slot_taken");
    expect(await code(service.reschedule(asha, id, { startAt: SLOT("09:00") }))).toBe("slot_taken");
    expect(
      (
        await q.query(
          "SELECT to_char(start_at AT TIME ZONE 'Asia/Kolkata','HH24:MI') AS t FROM appointments WHERE id=$1",
          [id],
        )
      ).rows[0]?.t,
    ).toBe("09:00");
  });

  it(`can be done ${MAX_RESCHEDULES} times, then not again`, async () => {
    const id = await confirmed(SLOT("09:00"));
    await service.reschedule(asha, id, { startAt: SLOT("09:30") });
    await service.reschedule(asha, id, { startAt: SLOT("10:00") });
    expect(await code(service.reschedule(asha, id, { startAt: SLOT("10:30") }))).toBe("conflict");
  });

  it("only the owner, only a confirmed appointment that has not started", async () => {
    const id = await confirmed();
    for (const who of [ravi, otherDoctor, support, admin, doctor]) {
      expect(
        await code(service.reschedule(who, id, { startAt: SLOT("10:00") })),
        who.roles.join(),
      ).toBe("not_found");
    }
    const held = await service.hold(
      asha,
      holdBody.parse({ patientId: ashaPatient, doctorId, startAt: SLOT("11:00") }),
    );
    expect(await code(service.reschedule(asha, held.id, { startAt: SLOT("11:30") }))).toBe(
      "conflict",
    );
    await q.query(
      "UPDATE appointments SET start_at = now() - interval '5 minutes', end_at = now() + interval '25 minutes' WHERE id=$1",
      [id],
    );
    expect(await code(service.reschedule(asha, id, { startAt: SLOT("10:00") }))).toBe("conflict");
    await q.query("UPDATE appointments SET status='cancelled_by_patient' WHERE id=$1", [id]);
    expect(await code(service.reschedule(asha, id, { startAt: SLOT("10:00") }))).toBe("conflict");
  });

  it("the body takes a time and nothing else", () => {
    expect(rescheduleBody.safeParse({ startAt: SLOT("10:00") }).success).toBe(true);
    expect(rescheduleBody.safeParse({ startAt: SLOT("10:00"), doctorId: uuidv7() }).success).toBe(
      false,
    );
    expect(rescheduleBody.safeParse({ startAt: "tomorrow" }).success).toBe(false);
  });
});

describe("who can read", () => {
  it("the account, the assigned doctor, admins and support; nobody else", async () => {
    const id = await confirmed();
    for (const who of [asha, doctor, admin, support, await person(["super_admin"])]) {
      expect((await service.get(who, id)).id, who.roles.join()).toBe(id);
    }
    for (const who of [ravi, otherDoctor]) {
      expect(await code(service.get(who, id)), who.roles.join()).toBe("not_found");
    }
    expect(await code(service.get(asha, uuidv7()))).toBe("not_found");
    expect(await code(service.get({ ...asha, limited: true }, id))).toBe("step_up_required");
  });

  it("the view carries names and money, but never the reason text or contact details", async () => {
    const view = await service.hold(
      asha,
      holdBody.parse({
        patientId: ashaPatient,
        doctorId,
        startAt: SLOT("09:00"),
        reason: "Chest pain",
      }),
    );
    const read = await service.get(asha, view.id);
    expect(Object.keys(read).sort()).toEqual([
      "doctorId",
      "doctorName",
      "endAt",
      "feePaise",
      "holdExpiresAt",
      "id",
      "patientId",
      "patientName",
      "rescheduleCount",
      "startAt",
      "status",
    ]);
    expect(JSON.stringify(read)).not.toMatch(/Chest|reason|example\.com|no-email/);
  });

  it("a patient lists only their own account's bookings, newest first, paged without gaps", async () => {
    const a = await confirmed(SLOT("09:00"));
    const b = await confirmed(SLOT("09:30"));
    const c = await confirmed(SLOT("10:00"));
    await confirmed(SLOT("10:30"), ravi, await profile(ravi));
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        asha,
        appointmentsQuery.parse({ limit: "2", ...(cursor ? { cursor } : {}) }),
      );
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([c, b, a]);
  });

  it("a doctor lists only their own confirmed upcoming appointments, soonest first", async () => {
    const a = await confirmed(SLOT("09:00"));
    const b = await confirmed(SLOT("09:30"), ravi, await profile(ravi));
    await service.hold(
      asha,
      holdBody.parse({ patientId: ashaPatient, doctorId, startAt: SLOT("10:00") }),
    ); // a hold: not listed
    const cancelled = await confirmed(SLOT("10:30"));
    await service.cancel(asha, cancelled, { reason: "other" });
    expect((await service.list(doctor, { limit: 10 })).items.map((i) => i.id)).toEqual([a, b]);
    expect((await service.list(otherDoctor, { limit: 10 })).items).toEqual([]);
  });

  it("forged cursors are refused", async () => {
    for (const cursor of [
      "x",
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify({ k: "1'; DROP", i: "x" })).toString("base64url"),
    ]) {
      expect(await code(service.list(asha, { limit: 5, cursor }))).toBe("validation_failed");
    }
  });
});

describe("the release job", () => {
  const expireNow = (id: string) =>
    q.query("UPDATE appointments SET hold_expires_at = now() - interval '1 minute' WHERE id=$1", [
      id,
    ]);
  const hold = (at: string, who = asha, patientId = ashaPatient) =>
    service.hold(who, holdBody.parse({ patientId, doctorId, startAt: SLOT(at) }));

  it("expires only holds that have run out, with history, and leaves everything else alone", async () => {
    const old = await hold("09:00");
    const fresh = await hold("09:30");
    const paid = await confirmed(SLOT("10:00"));
    await expireNow(old.id);
    const released = await service.releaseExpired();
    expect(released).toBeGreaterThanOrEqual(1);
    expect(await status(old.id)).toBe("expired");
    expect(await status(fresh.id)).toBe("held");
    expect(await status(paid)).toBe("scheduled");
    expect((await history(old.id)).map((h) => h.to_status)).toEqual(["held", "expired"]);
    expect(
      (await q.query("SELECT hold_expires_at FROM appointments WHERE id=$1", [old.id])).rows[0]
        ?.hold_expires_at,
    ).toBeNull();
  });

  it("running it again changes nothing, and a freed slot can be held by someone else", async () => {
    const old = await hold("09:00");
    await expireNow(old.id);
    await service.releaseExpired();
    const before = (await history(old.id)).length;
    expect(await service.releaseExpired()).toBe(0);
    expect((await history(old.id)).length).toBe(before);
    const ravisProfile = await profile(ravi);
    expect((await hold("09:00", ravi, ravisProfile)).status).toBe("held");
  });

  it("works through a backlog in batches", async () => {
    const ids: string[] = [];
    for (const t of ["09:00", "09:30", "10:00", "10:30", "11:00"]) {
      const h = await hold(t, asha);
      await q.query("UPDATE appointments SET booked_by_user_id = $2 WHERE id = $1", [
        h.id,
        (await person()).userId,
      ]); // different bookers: the open-hold cap is per person
      await expireNow(h.id);
      ids.push(h.id);
    }
    expect(await service.releaseExpired(2, 10)).toBeGreaterThanOrEqual(5);
    for (const id of ids) expect(await status(id)).toBe("expired");
  });
});

describe("a payment arriving (the late-payment hook)", () => {
  const heldAt = (at: string, who = asha, patientId = ashaPatient) =>
    service.hold(who, holdBody.parse({ patientId, doctorId, startAt: SLOT(at) }));
  const expireNow = (id: string) =>
    q.query("UPDATE appointments SET hold_expires_at = now() - interval '1 minute' WHERE id=$1", [
      id,
    ]);

  it("a payment inside the hold confirms it", async () => {
    const h = await heldAt("09:00");
    expect(await service.confirmAfterPayment(h.id, null)).toBe("confirmed");
    expect(await status(h.id)).toBe("scheduled");
    expect((await history(h.id)).map((x) => x.to_status)).toEqual(["held", "scheduled"]);
    expect(
      (await q.query("SELECT hold_expires_at FROM appointments WHERE id=$1", [h.id])).rows[0]
        ?.hold_expires_at,
    ).toBeNull();
  });

  it("a repeated payment event confirms once and then says already", async () => {
    const h = await heldAt("09:00");
    expect(await service.confirmAfterPayment(h.id, null)).toBe("confirmed");
    expect(await service.confirmAfterPayment(h.id, null)).toBe("already");
    expect((await history(h.id)).length).toBe(2);
  });

  it("a late payment confirms if the time is still free, whether or not the job has run", async () => {
    const h = await heldAt("09:00");
    await expireNow(h.id);
    expect(await service.confirmAfterPayment(h.id, null)).toBe("confirmed_late");
    const h2 = await heldAt("09:30");
    await expireNow(h2.id);
    await service.releaseExpired();
    expect(await status(h2.id)).toBe("expired");
    expect(await service.confirmAfterPayment(h2.id, null)).toBe("confirmed_late");
    expect(await status(h2.id)).toBe("scheduled");
  });

  it("a late payment for a time someone else now holds or has booked is slot_lost, and changes nothing", async () => {
    const h = await heldAt("10:00");
    await expireNow(h.id);
    await service.releaseExpired();
    const ravisProfile = await profile(ravi);
    const other = await heldAt("10:00", ravi, ravisProfile);
    expect(await service.confirmAfterPayment(h.id, null)).toBe("slot_lost");
    expect(await status(h.id)).toBe("expired");
    expect(await status(other.id)).toBe("held");
  });

  it("a released, cancelled or unknown appointment is not payable", async () => {
    const h = await heldAt("10:30");
    await service.cancel(asha, h.id, { reason: "changed_mind" });
    expect(await service.confirmAfterPayment(h.id, null)).toBe("not_payable");
    expect(await service.confirmAfterPayment(uuidv7(), null)).toBe("not_payable");
    expect(await status(h.id)).toBe("cancelled_by_patient");
  });
});
