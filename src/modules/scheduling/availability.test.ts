import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { MemoryCache } from "../../lib/cache";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import type { Principal } from "../identity/policy";
import { AppointmentRepo } from "./appointments-repo";
import { AvailabilityService } from "./availability";
import { AvailabilityRepo } from "./availability-repo";
import { MAX_FUTURE_TIME_OFF, hoursBody, timeOffBody } from "./availability-schemas";
import { SchedulingRepo } from "./repo";
import { SlotService } from "./service";

// "Now" is Sunday 1 Nov 2026, 10:00 India time.
const NOW = new Date("2026-11-01T10:00:00+05:30");
let q: Queryable;
let tx: TxRunner;
let service: AvailabilityService;
let slots: SlotService;
let doctor: Principal;
let doctorId: string;
let other: Principal;
let patient: Principal;
let admin: Principal;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
async function person(roles: Role[]): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
async function doctorFor(p: Principal) {
  const id = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications,
       kyc_status, status) VALUES ($1,$2,'Dr Hours',$3,'Council','MBBS','approved','active')`,
    [id, p.userId, `AV-${id.slice(-8)}`],
  );
  return id;
}
const rule = (weekday: number, startTime = "09:00", endTime = "12:00", slotMinutes = 30) => ({
  weekday,
  startTime,
  endTime,
  slotMinutes,
});
const hours = (rules: ReturnType<typeof rule>[]) => hoursBody.parse({ rules });
const freeOn = async (date: string) =>
  (await slots.list(doctorId, { from: date, to: date })).slots.length;

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
  slots = new SlotService({
    repo: new SchedulingRepo(q),
    cache: () => new MemoryCache(),
    env: "test",
    now: () => NOW,
    booked: (d, f, t) => new AppointmentRepo(q).activeIntervals(d, f, t),
  });
  service = new AvailabilityService({ repo: new AvailabilityRepo(q, tx), slots, now: () => NOW });
  doctor = await person(["doctor"]);
  other = await person(["doctor"]);
  patient = await person(["patient"]);
  admin = await person(["admin"]);
  doctorId = await doctorFor(doctor);
  await doctorFor(other);
});

describe("weekly hours", () => {
  it("starts empty, saves, reads back, and the public slot list follows at once", async () => {
    expect((await service.get(doctor)).rules).toEqual([]);
    expect(await freeOn("2026-11-02")).toBe(0);
    const saved = await service.saveHours(doctor, hours([rule(1), rule(1, "14:00", "16:00", 30)]));
    expect(saved.rules).toEqual([rule(1), rule(1, "14:00", "16:00", 30)]);
    expect(await freeOn("2026-11-02")).toBe(6 + 4);
    // Replacing them changes the list at once, with no waiting for the cache.
    await service.saveHours(doctor, hours([rule(1, "09:00", "10:00", 30)]));
    expect(await freeOn("2026-11-02")).toBe(2);
    await service.saveHours(doctor, hours([]));
    expect(await freeOn("2026-11-02")).toBe(0);
  });

  it("an end of 24:00 is kept as 24:00", async () => {
    const saved = await service.saveHours(doctor, hours([rule(2, "20:00", "24:00", 60)]));
    expect(saved.rules).toEqual([rule(2, "20:00", "24:00", 60)]);
  });

  it("each doctor has their own hours", async () => {
    await service.saveHours(doctor, hours([rule(3)]));
    expect((await service.get(other)).rules).toEqual([]);
    await service.saveHours(other, hours([rule(4)]));
    expect((await service.get(doctor)).rules).toEqual([rule(3)]);
  });

  it("bad hours are refused before any write", () => {
    const bad = (rules: unknown) => hoursBody.safeParse({ rules }).success;
    expect(bad([rule(1, "12:00", "09:00")])).toBe(false);
    expect(bad([rule(1, "09:00", "09:00")])).toBe(false);
    expect(bad([rule(1, "09:00", "09:50", 30)])).toBe(false); // not whole slots
    expect(bad([rule(1, "09:00", "12:00", 25)])).toBe(false); // not an allowed length
    expect(bad([rule(1, "09:00", "12:00"), rule(1, "11:00", "13:00")])).toBe(false); // overlap
    expect(bad([rule(1, "09:00", "12:00"), rule(1, "12:00", "13:00")])).toBe(true); // touching is fine
    expect(bad([rule(1, "09:00", "12:00"), rule(2, "11:00", "13:00")])).toBe(true); // other day
    expect(bad([rule(7)])).toBe(false);
    expect(bad([rule(1, "9am", "12:00")])).toBe(false);
    expect(bad(Array.from({ length: 29 }, () => rule(1)))).toBe(false);
    expect(hoursBody.safeParse({ rules: [], doctorId: uuidv7() }).success).toBe(false);
    expect(hoursBody.safeParse({ rules: [{ ...rule(1), validFrom: "2020-01-01" }] }).success).toBe(
      false,
    );
  });

  it("a failed save leaves the old hours untouched (all or nothing)", async () => {
    await service.saveHours(doctor, hours([rule(1)]));
    const repo = new AvailabilityRepo(q, tx);
    // Written around the checks: the second window overlaps the first, so the database refuses it.
    await expect(
      repo.replaceRules(doctorId, [rule(5), rule(5, "10:00", "11:00")], "2026-11-01", uuidv7),
    ).rejects.toThrow();
    expect((await service.get(doctor)).rules).toEqual([rule(1)]);
  });
});

describe("time off", () => {
  it("blocks the days, shows in the list, and removes the slots", async () => {
    await service.saveHours(doctor, hours([rule(1)]));
    expect(await freeOn("2026-11-02")).toBe(6);
    const added = await service.addTimeOff(
      doctor,
      timeOffBody.parse({ from: "2026-11-02", to: "2026-11-03", reason: "Conference" }),
    );
    expect(added).toMatchObject({
      from: "2026-11-02",
      to: "2026-11-03",
      reason: "Conference",
      affectedAppointments: 0,
    });
    expect(await freeOn("2026-11-02")).toBe(0);
    expect((await service.get(doctor)).timeOff).toEqual([
      { id: added.id, from: "2026-11-02", to: "2026-11-03", reason: "Conference" },
    ]);
    await service.removeTimeOff(doctor, added.id);
    expect(await freeOn("2026-11-02")).toBe(6);
    expect((await service.get(doctor)).timeOff).toEqual([]);
  });

  it("a single day lasts exactly that India day; the next day is free", async () => {
    await service.saveHours(doctor, hours([rule(1), rule(2)]));
    await service.addTimeOff(doctor, timeOffBody.parse({ from: "2026-11-02", to: "2026-11-02" }));
    expect(await freeOn("2026-11-02")).toBe(0);
    expect(await freeOn("2026-11-03")).toBe(6);
  });

  it("reports the bookings it overlaps, and does not touch them", async () => {
    await service.saveHours(doctor, hours([rule(1)]));
    const pid = uuidv7();
    const owner = await person(["patient"]);
    await q.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
      [pid, owner.userId],
    );
    const appt = uuidv7();
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,'2026-11-02T04:00:00Z','2026-11-02T04:30:00Z','scheduled',1)`,
      [appt, pid, doctorId, owner.userId],
    );
    const added = await service.addTimeOff(
      doctor,
      timeOffBody.parse({ from: "2026-11-02", to: "2026-11-02" }),
    );
    expect(added.affectedAppointments).toBe(1);
    expect(
      (await q.query("SELECT status FROM appointments WHERE id=$1", [appt])).rows[0]?.status,
    ).toBe("scheduled");
  });

  it("refuses the past, reversed or too long ranges, and impossible dates", async () => {
    expect(
      await code(
        service.addTimeOff(doctor, timeOffBody.parse({ from: "2026-10-31", to: "2026-11-02" })),
      ),
    ).toBe("validation_failed");
    expect(timeOffBody.safeParse({ from: "2026-11-05", to: "2026-11-02" }).success).toBe(false);
    expect(timeOffBody.safeParse({ from: "2026-11-02", to: "2027-03-01" }).success).toBe(false);
    expect(timeOffBody.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
    expect(timeOffBody.safeParse({ from: "2026-11-02", to: "2026-11-03", extra: 1 }).success).toBe(
      false,
    );
    expect(
      timeOffBody.safeParse({ from: "2026-11-02", to: "2026-11-03", reason: "x".repeat(201) })
        .success,
    ).toBe(false);
  });

  it(`at most ${MAX_FUTURE_TIME_OFF} entries ahead`, async () => {
    for (let i = 0; i < MAX_FUTURE_TIME_OFF; i++) {
      const day = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
      await service.addTimeOff(doctor, timeOffBody.parse({ from: day, to: day }));
    }
    expect(
      await code(
        service.addTimeOff(doctor, timeOffBody.parse({ from: "2027-06-01", to: "2027-06-01" })),
      ),
    ).toBe("conflict");
  });

  it("another doctor's entry is 404 and stays put", async () => {
    const added = await service.addTimeOff(
      doctor,
      timeOffBody.parse({ from: "2026-11-10", to: "2026-11-10" }),
    );
    expect(await code(service.removeTimeOff(other, added.id))).toBe("not_found");
    expect(await code(service.removeTimeOff(doctor, uuidv7()))).toBe("not_found");
    expect((await service.get(doctor)).timeOff).toHaveLength(1);
  });
});

describe("who may use it", () => {
  it("only a doctor with a doctor record; patients, admins and a doctor with no record get 404", async () => {
    const noRecord = await person(["doctor"]);
    for (const who of [patient, admin, noRecord]) {
      expect(await code(service.get(who)), who.roles.join()).toBe("not_found");
      expect(await code(service.saveHours(who, hours([rule(1)])))).toBe("not_found");
      expect(
        await code(
          service.addTimeOff(who, timeOffBody.parse({ from: "2026-11-10", to: "2026-11-10" })),
        ),
      ).toBe("not_found");
      expect(await code(service.removeTimeOff(who, uuidv7()))).toBe("not_found");
    }
  });
});
