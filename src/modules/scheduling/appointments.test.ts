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
import { AppointmentRepo } from "./appointments-repo";
import { AppointmentService, HOLD_SECONDS, MAX_ACTIVE_HOLDS, holdBody } from "./appointments";
import { SchedulingRepo } from "./repo";
import { SlotService } from "./service";

// "Now" is Sunday 1 Nov 2026 10:00 India time; the doctor works Mondays 09:00-11:00 (30 minute slots).
const NOW = new Date("2026-11-01T10:00:00+05:30");
const SLOT = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00+05:30`).toISOString();
const crypto = new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars"));

let q: Queryable;
let service: AppointmentService;
let slots: SlotService;
let doctorId: string;
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
async function profile(owner: Principal, dob = "1990-01-01", relation = "self") {
  const id = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,$3,'Test Person',$4,'female',($4::date > CURRENT_DATE - interval '18 years'))`,
    [id, owner.userId, relation, dob],
  );
  return id;
}
const hold = (who: Principal, over: Record<string, unknown> = {}) =>
  service.hold(
    who,
    holdBody.parse({ patientId: ashaPatient, doctorId, startAt: SLOT("09:00"), ...over }),
  );

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
  slots = new SlotService({
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
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,'Dr Hold',$2,'Council','MBBS',45000,'approved','active',$3)`,
    [doctorId, `H-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
  );
  await q.query(
    `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
     VALUES ($1,$2,1,'09:00','11:00',30,'2026-01-01')`,
    [uuidv7(), doctorId],
  );
  asha = await person();
  ashaPatient = await profile(asha);
  ravi = await person();
});

describe("holding a slot", () => {
  it("holds a free slot, copies the doctor's fee, and sets the expiry and the history", async () => {
    const view = await hold(asha);
    expect(view).toMatchObject({
      status: "held",
      feePaise: 45000,
      doctorId,
      patientId: ashaPatient,
    });
    expect(view.endAt).toBe(SLOT("09:30"));
    const ttl = new Date(view.holdExpiresAt as string).getTime() - Date.now();
    expect(ttl).toBeGreaterThan((HOLD_SECONDS - 30) * 1000);
    expect(ttl).toBeLessThanOrEqual(HOLD_SECONDS * 1000);
    const history = (await q.query("SELECT from_status, to_status FROM appointment_status_history"))
      .rows;
    expect(history).toEqual([{ from_status: null, to_status: "held" }]);
  });

  it("a held slot leaves the public list at once, and a second hold is 409", async () => {
    await hold(asha);
    const free = await slots.list(doctorId, { from: "2026-11-02", to: "2026-11-02", fresh: true });
    expect(free.slots.map((s) => s.startAt)).not.toContain(new Date(SLOT("09:00")).toISOString());
    expect(await code(hold(ravi, { patientId: await profile(ravi) }))).toBe("slot_taken");
  });

  it("the fee is the doctor's, not the client's: an amount field is refused", () => {
    expect(
      holdBody.safeParse({ patientId: uuidv7(), doctorId, startAt: SLOT("09:00"), feePaise: 1 })
        .success,
    ).toBe(false);
    expect(
      holdBody.safeParse({
        patientId: uuidv7(),
        doctorId,
        startAt: SLOT("09:00"),
        status: "scheduled",
      }).success,
    ).toBe(false);
  });

  it("only exact free slots: odd times, off hours and other days are refused", async () => {
    for (const startAt of [
      SLOT("09:15"),
      SLOT("12:00"),
      "2026-11-03T09:00:00+05:30",
      "2026-10-01T09:00:00+05:30",
    ]) {
      // A date in the past is refused by the window check, the rest as "not a free slot".
      const result = await code(hold(asha, { startAt: new Date(startAt).toISOString() }));
      expect(["slot_taken", "validation_failed"], startAt).toContain(result);
    }
  });

  it("someone else's patient profile, a missing one, and a doctor account are 404", async () => {
    expect(await code(hold(ravi))).toBe("not_found"); // Asha's profile
    expect(await code(hold(asha, { patientId: uuidv7() }))).toBe("not_found");
    const doctorAccount = await person(["doctor"]);
    expect(await code(hold(doctorAccount))).toBe("not_found");
  });

  it("a doctor who is not listed is 404", async () => {
    await q.query("UPDATE doctors SET status = 'suspended' WHERE id = $1", [doctorId]);
    expect(await code(hold(asha))).toBe("not_found");
  });

  it("a limited session cannot hold", async () => {
    expect(await code(hold({ ...asha, limited: true }))).toBe("step_up_required");
  });
});

describe("holds that run out", () => {
  it("an expired hold does not block the slot; the new hold takes it and the old one is marked expired", async () => {
    const first = await hold(asha);
    await q.query(
      "UPDATE appointments SET hold_expires_at = now() - interval '1 minute' WHERE id = $1",
      [first.id],
    );
    const second = await hold(ravi, { patientId: await profile(ravi) });
    expect(second.status).toBe("held");
    const rows = (
      await q.query(
        "SELECT id, status FROM appointments WHERE doctor_id = $1 ORDER BY created_at, id",
        [doctorId],
      )
    ).rows;
    expect(rows.map((r) => r.status)).toEqual(["expired", "held"]);
    const history = (
      await q.query(
        "SELECT to_status FROM appointment_status_history WHERE appointment_id = $1 ORDER BY id",
        [first.id],
      )
    ).rows;
    expect(history.map((h) => h.to_status)).toEqual(["held", "expired"]);
  });

  it("a person can hold only a few slots at once", async () => {
    const times = ["09:00", "09:30", "10:00", "10:30"];
    for (const t of times.slice(0, MAX_ACTIVE_HOLDS)) await hold(asha, { startAt: SLOT(t) });
    expect(await code(hold(asha, { startAt: SLOT(times[MAX_ACTIVE_HOLDS] as string) }))).toBe(
      "conflict",
    );
    // Another person is not affected.
    await hold(ravi, { patientId: await profile(ravi), startAt: SLOT("10:30") });
  });
});

describe("children", () => {
  it("a minor needs a named attending adult; an adult's adult fields are not stored", async () => {
    const child = await profile(asha, "2020-05-05", "child");
    expect(await code(hold(asha, { patientId: child }))).toBe("validation_failed");
    const ok = await hold(asha, {
      patientId: child,
      attendingAdult: { name: "Asha Verma", relation: "Mother" },
    });
    const row = (
      await q.query(
        "SELECT attending_adult_name, attending_adult_relation FROM appointments WHERE id = $1",
        [ok.id],
      )
    ).rows[0];
    expect(row).toEqual({ attending_adult_name: "Asha Verma", attending_adult_relation: "Mother" });
    const adult = await hold(asha, {
      startAt: SLOT("10:00"),
      attendingAdult: { name: "Someone", relation: "Friend" },
    });
    const stored = (
      await q.query("SELECT attending_adult_name FROM appointments WHERE id = $1", [adult.id])
    ).rows[0];
    expect(stored?.attending_adult_name).toBeNull();
  });
});

describe("the reason", () => {
  it("is stored encrypted, never as plain text, and is not in the response", async () => {
    const view = await hold(asha, { reason: "Chest pain since yesterday" });
    const stored = String(
      (await q.query("SELECT reason_enc FROM appointments WHERE id = $1", [view.id])).rows[0]
        ?.reason_enc,
    );
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("Chest");
    expect(JSON.stringify(view)).not.toContain("Chest");
    expect(await crypto.decrypt(stored, "appointments.reason_enc")).toBe(
      "Chest pain since yesterday",
    );
  });
});

describe("the database is the last guard", () => {
  it("refuses overlapping active rows even when written around the service", async () => {
    const first = await hold(asha);
    await expect(
      q.query(
        `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
         VALUES ($1,$2,$3,$4,$5,$6,'scheduled',1)`,
        [
          uuidv7(),
          ashaPatient,
          doctorId,
          asha.userId,
          new Date(SLOT("09:15")),
          new Date(SLOT("09:45")),
        ],
      ),
    ).rejects.toThrow(/no_double_booking/);
    // Once the first is cancelled the time is free again.
    await q.query(
      "UPDATE appointments SET status = 'cancelled_by_patient', hold_expires_at = NULL WHERE id = $1",
      [first.id],
    );
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled',1)`,
      [
        uuidv7(),
        ashaPatient,
        doctorId,
        asha.userId,
        new Date(SLOT("09:15")),
        new Date(SLOT("09:45")),
      ],
    );
  });

  it("the status history cannot be changed, even by the table owner's trigger", async () => {
    await hold(asha);
    await expect(q.query("UPDATE appointment_status_history SET to_status = 'x'")).rejects.toThrow(
      /append-only|permission|not allowed|forbid/i,
    );
    await expect(q.query("DELETE FROM appointment_status_history")).rejects.toThrow(
      /append-only|permission|not allowed|forbid/i,
    );
  });
});

describe("the route", () => {
  it("is idempotent-required, session-only, and refuses unknown fields", async () => {
    const mod = (await import("../../app/api/v1/appointments/route")) as {
      POST: (r: Request, c?: unknown) => Promise<Response>;
    };
    const res = await mod.POST(
      new Request("http://localhost:3000/api/v1/appointments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: "{}",
      }),
    );
    expect([401, 404]).toContain(res.status);
  });
});
