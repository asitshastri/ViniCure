import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { MemoryCache } from "../../lib/cache";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { setSlotsForTest } from "./index";
import { SchedulingRepo } from "./repo";
import { MAX_WINDOW_DAYS, SlotService } from "./service";
import type { Interval } from "./slots";

// 2026-11-01 is a Sunday; 2026-11-02 a Monday. "Now" is Sunday 10:00 India time.
const NOW = new Date("2026-11-01T10:00:00+05:30");
let q: Queryable;
let cache: MemoryCache;
let service: SlotService;
let booked: Interval[];
let doctorId: string;
let queries: number;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};

async function newDoctor(status = "active", kyc = "approved") {
  const id = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       kyc_status, status, applicant_email)
     VALUES ($1,'Dr Slots',$2,'Council','MBBS',$3,$4,$5)`,
    [id, `S-${id.slice(-8)}`, kyc, status, `${id}@example.com`],
  );
  return id;
}
const rule = (id: string, weekday: number, from = "09:00", to = "11:00") =>
  q.query(
    `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
     VALUES ($1,$2,$3,$4,$5,30,'2026-01-01')`,
    [uuidv7(), id, weekday, from, to],
  );

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (text, params) => {
      queries++;
      return { rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[] };
    },
  };
}, 60_000);

beforeEach(async () => {
  queries = 0;
  cache = new MemoryCache();
  booked = [];
  service = new SlotService({
    repo: new SchedulingRepo(q),
    cache: () => cache,
    env: "test",
    now: () => NOW,
    booked: async () => booked,
  });
  setSlotsForTest(service);
  doctorId = await newDoctor();
  await rule(doctorId, 1); // Mondays 09:00-11:00
});

describe("the list", () => {
  it("gives the free slots in India time for the next days", async () => {
    const { slots } = await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" });
    expect(slots.map((s) => s.startAt)).toEqual([
      "2026-11-02T03:30:00.000Z",
      "2026-11-02T04:00:00.000Z",
      "2026-11-02T04:30:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ]);
  });

  it("with no dates, lists the coming week from today", async () => {
    const { slots } = await service.list(doctorId, {});
    expect(slots).toHaveLength(4); // the one Monday inside Sun 1 Nov to Sat 7 Nov
  });

  it("leave and bookings take slots away; leave in another window does not", async () => {
    await q.query(
      "INSERT INTO doctor_time_off (id, doctor_id, start_at, end_at) VALUES ($1,$2,$3,$4)",
      [uuidv7(), doctorId, "2026-11-02T03:30:00Z", "2026-11-02T04:00:00Z"],
    );
    await q.query(
      "INSERT INTO doctor_time_off (id, doctor_id, start_at, end_at) VALUES ($1,$2,$3,$4)",
      [uuidv7(), doctorId, "2026-12-01T00:00:00Z", "2026-12-02T00:00:00Z"],
    );
    booked = [{ start: new Date("2026-11-02T04:30:00Z"), end: new Date("2026-11-02T05:00:00Z") }];
    const { slots } = await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" });
    expect(slots.map((s) => s.startAt)).toEqual([
      "2026-11-02T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ]);
  });

  it("a doctor who is not listed is a 404, whatever the reason", async () => {
    for (const [status, kyc] of [
      ["pending", "pending"],
      ["pending", "rejected"],
      ["suspended", "approved"],
    ] as const) {
      const id = await newDoctor(status, kyc);
      await rule(id, 1);
      expect(
        await code(service.list(id, { from: "2026-11-02", to: "2026-11-02" })),
        status + kyc,
      ).toBe("not_found");
    }
    expect(await code(service.list(uuidv7(), {}))).toBe("not_found");
  });
});

describe("the window", () => {
  it("refuses the past, impossible dates, reversed or too long windows", async () => {
    expect(await code(service.list(doctorId, { from: "2026-10-31" }))).toBe("validation_failed");
    expect(await code(service.list(doctorId, { from: "2026-02-30" }))).toBe("validation_failed");
    expect(await code(service.list(doctorId, { from: "2026-11-05", to: "2026-11-02" }))).toBe(
      "validation_failed",
    );
    expect(await code(service.list(doctorId, { from: "2026-11-02", to: "2026-11-30" }))).toBe(
      "validation_failed",
    );
    expect(await code(service.list(doctorId, { from: "2026-11-02", to: "nonsense" }))).toBe(
      "validation_failed",
    );
    // Exactly the maximum is fine.
    expect(await code(service.list(doctorId, { from: "2026-11-02", to: "2026-11-15" }))).toBe("ok");
    expect(MAX_WINDOW_DAYS).toBe(14);
  });

  it("does not offer a slot that starts inside the lead time, or beyond the horizon", async () => {
    // Today is Sunday; a rule for today from 10:00 to 12:00 with 30 minutes lead gives 10:30 on.
    await rule(doctorId, 0, "10:00", "12:00");
    const today = await service.list(doctorId, { from: "2026-11-01", to: "2026-11-01" });
    expect(today.slots.map((s) => s.startAt)).toEqual([
      "2026-11-01T05:00:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:00:00.000Z",
    ]);
    // 30 day horizon: a Monday 40 days out is not offered.
    const far = await service.list(doctorId, { from: "2026-12-14", to: "2026-12-14" });
    expect(far.slots).toEqual([]);
  });
});

describe("the short cache", () => {
  it("serves the second call from the cache without touching the database", async () => {
    await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" });
    const after = queries;
    const again = await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" });
    expect(again.slots).toHaveLength(4);
    // Only the cheap listed-check runs again; the rule and leave queries do not.
    expect(queries - after).toBe(1);
  });

  it("is rebuilt at once after invalidate, and each window has its own entry", async () => {
    await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" });
    booked = [{ start: new Date("2026-11-02T03:30:00Z"), end: new Date("2026-11-02T04:00:00Z") }];
    expect(
      (await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" })).slots,
    ).toHaveLength(4); // stale on purpose
    await service.invalidate(doctorId);
    expect(
      (await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" })).slots,
    ).toHaveLength(3);
    expect(
      (await service.list(doctorId, { from: "2026-11-09", to: "2026-11-09" })).slots,
    ).toHaveLength(4);
  });

  it("a damaged cache entry is ignored, and a cache outage still answers", async () => {
    await service.list(doctorId, { from: "2026-11-02", to: "2026-11-02" });
    const broken = new SlotService({
      repo: new SchedulingRepo(q),
      cache: () =>
        ({
          get: async () => "{not json",
          set: async () => {
            throw new Error("cache down");
          },
          peekWindow: async () => ({ count: 0, ttlMs: 0 }),
        }) as never,
      env: "test",
      now: () => NOW,
    });
    expect(
      (await broken.list(doctorId, { from: "2026-11-02", to: "2026-11-02" })).slots,
    ).toHaveLength(4);
  });
});

describe("the route", () => {
  const call = async (id: string, search = "") => {
    const mod = (await import("../../app/api/v1/doctors/[id]/slots/route")) as {
      GET: (r: Request, c?: unknown) => Promise<Response>;
    };
    return mod.GET(
      new Request(`http://localhost:3000/api/v1/doctors/${id}/slots${search}`, {
        headers: { host: "localhost:3000" },
      }),
      {
        params: Promise.resolve({ id }),
      },
    );
  };

  it("answers with a few seconds of public cache", async () => {
    const res = await call(doctorId, "?from=2026-11-02&to=2026-11-02");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/^public, max-age=10, s-maxage=10/);
    expect(((await res.json()) as { slots: unknown[] }).slots).toHaveLength(4);
  });

  it("404 for an unlisted doctor and 422 for a bad id or query; neither is cached", async () => {
    const pending = await newDoctor("pending", "pending");
    for (const res of [
      await call(pending, "?from=2026-11-02"),
      await call("not-a-uuid"),
      await call(doctorId, "?from=2026-11-02&x=1"),
      await call(doctorId, "?from=11/02/2026"),
    ]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect((await call(pending, "?from=2026-11-02")).status).toBe(404);
    expect((await call("not-a-uuid")).status).toBe(422);
    expect((await call(doctorId, "?from=2026-11-02&x=1")).status).toBe(422);
    expect((await call(doctorId, "?from=11/02/2026")).status).toBe(422);
  });
});
