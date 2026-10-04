import { describe, expect, it } from "vitest";
import {
  generateSlots,
  istDate,
  istMidnight,
  minutesOfDay,
  type AvailabilityRule,
  type SlotQuery,
} from "./slots";

// 2026-11-02 is a Monday. 09:00 India time is 03:30 UTC.
const MONDAY = "2026-11-02";
const rule = (over: Partial<AvailabilityRule> = {}): AvailabilityRule => ({
  weekday: 1,
  startTime: "09:00",
  endTime: "11:00",
  slotMinutes: 30,
  validFrom: "2026-01-01",
  validTo: null,
  ...over,
});
const at = (hhmm: string, date = MONDAY) => new Date(`${date}T${hhmm}:00+05:30`);
const query = (over: Partial<SlotQuery> = {}): SlotQuery => ({
  rules: [rule()],
  timeOff: [],
  booked: [],
  fromDate: MONDAY,
  toDate: MONDAY,
  now: at("00:00", "2026-11-01"),
  minLeadMinutes: 0,
  maxHorizonDays: 60,
  ...over,
});
const starts = (q: SlotQuery) =>
  generateSlots(q).map((s) =>
    new Date(s.startAt).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

describe("a plain day", () => {
  it("cuts the hours into whole slots, in India time", () => {
    expect(starts(query())).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    const first = generateSlots(query())[0];
    expect(first).toEqual({
      startAt: "2026-11-02T03:30:00.000Z",
      endAt: "2026-11-02T04:00:00.000Z",
    });
  });

  it("drops a last slot that would run past the end", () => {
    expect(starts(query({ rules: [rule({ endTime: "10:50" })] }))).toEqual([
      "09:00",
      "09:30",
      "10:00",
    ]);
    expect(starts(query({ rules: [rule({ endTime: "09:20" })] }))).toEqual([]);
  });

  it("only the matching weekday, within the validity dates", () => {
    expect(starts(query({ rules: [rule({ weekday: 2 })] }))).toEqual([]);
    expect(starts(query({ rules: [rule({ validFrom: "2026-11-03" })] }))).toEqual([]);
    expect(starts(query({ rules: [rule({ validTo: "2026-11-01" })] }))).toEqual([]);
    // Both ends are inclusive.
    expect(starts(query({ rules: [rule({ validFrom: MONDAY, validTo: MONDAY })] }))).toHaveLength(
      4,
    );
  });

  it("a week lists each matching day once, in order", () => {
    const week = generateSlots(
      query({ fromDate: "2026-11-02", toDate: "2026-11-15", rules: [rule({ endTime: "09:30" })] }),
    );
    expect(week.map((s) => s.startAt)).toEqual([
      "2026-11-02T03:30:00.000Z",
      "2026-11-09T03:30:00.000Z",
    ]);
  });
});

describe("time off and bookings", () => {
  it("leave removes the slots it touches; touching edges stay free (half-open)", () => {
    const leave = { start: at("09:30"), end: at("10:30") };
    expect(starts(query({ timeOff: [leave] }))).toEqual(["09:00", "10:30"]);
    // Leave that starts exactly when a slot ends does not remove that slot.
    expect(starts(query({ timeOff: [{ start: at("10:00"), end: at("12:00") }] }))).toEqual([
      "09:00",
      "09:30",
    ]);
  });

  it("a booking removes only its own slot, and a longer booking removes every slot it covers", () => {
    expect(starts(query({ booked: [{ start: at("09:30"), end: at("10:00") }] }))).toEqual([
      "09:00",
      "10:00",
      "10:30",
    ]);
    expect(starts(query({ booked: [{ start: at("09:15"), end: at("10:15") }] }))).toEqual([
      "10:30",
    ]);
  });

  it("overlapping leave and bookings do not matter twice", () => {
    const q = query({
      timeOff: [
        { start: at("09:00"), end: at("10:00") },
        { start: at("09:30"), end: at("10:30") },
      ],
      booked: [{ start: at("09:00"), end: at("09:30") }],
    });
    expect(starts(q)).toEqual(["10:30"]);
  });

  it("leave covering the whole day, or the whole window, leaves nothing", () => {
    expect(
      starts(query({ timeOff: [{ start: at("00:00"), end: at("00:00", "2026-11-03") }] })),
    ).toEqual([]);
  });
});

describe("now, lead time and horizon", () => {
  it("never offers a slot in the past or inside the lead time", () => {
    expect(starts(query({ now: at("09:10"), minLeadMinutes: 0 }))).toEqual([
      "09:30",
      "10:00",
      "10:30",
    ]);
    expect(starts(query({ now: at("09:10"), minLeadMinutes: 30 }))).toEqual(["10:00", "10:30"]);
    // A slot exactly at now plus the lead is allowed.
    expect(starts(query({ now: at("08:30"), minLeadMinutes: 30 }))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
    ]);
  });

  it("stops at the horizon", () => {
    const far = query({
      fromDate: "2026-11-02",
      toDate: "2027-03-01",
      rules: [rule({ endTime: "09:30" })],
      now: at("00:00", "2026-11-01"),
      maxHorizonDays: 9,
    });
    expect(generateSlots(far).map((s) => s.startAt)).toEqual([
      "2026-11-02T03:30:00.000Z",
      "2026-11-09T03:30:00.000Z",
    ]);
  });
});

describe("midnight", () => {
  it("a rule that ends at 24:00 runs to the end of the day, and the next day starts fresh", () => {
    const late = rule({ startTime: "22:00", endTime: "24:00", slotMinutes: 60 });
    const slots = generateSlots(
      query({
        rules: [late, rule({ weekday: 2, startTime: "00:00", endTime: "01:00", slotMinutes: 60 })],
        fromDate: MONDAY,
        toDate: "2026-11-03",
      }),
    );
    expect(slots.map((s) => [s.startAt, s.endAt])).toEqual([
      ["2026-11-02T16:30:00.000Z", "2026-11-02T17:30:00.000Z"], // 22:00-23:00 IST
      ["2026-11-02T17:30:00.000Z", "2026-11-02T18:30:00.000Z"], // 23:00-24:00 IST
      ["2026-11-02T18:30:00.000Z", "2026-11-02T19:30:00.000Z"], // Tuesday 00:00-01:00 IST
    ]);
  });

  it("the weekday is the India weekday: a Monday 01:00 IST slot is still Sunday in UTC", () => {
    const slots = generateSlots(
      query({ rules: [rule({ startTime: "01:00", endTime: "02:00", slotMinutes: 60 })] }),
    );
    expect(slots).toEqual([
      { startAt: "2026-11-01T19:30:00.000Z", endAt: "2026-11-01T20:30:00.000Z" },
    ]);
  });

  it("leave that crosses midnight removes late slots on one day and early slots on the next", () => {
    const rules = [
      rule({ startTime: "22:00", endTime: "24:00", slotMinutes: 60 }),
      rule({ weekday: 2, startTime: "00:00", endTime: "02:00", slotMinutes: 60 }),
    ];
    const leave = { start: at("23:00"), end: at("01:00", "2026-11-03") };
    const left = generateSlots(
      query({ rules, timeOff: [leave], fromDate: MONDAY, toDate: "2026-11-03" }),
    );
    expect(left.map((s) => s.startAt)).toEqual([
      "2026-11-02T16:30:00.000Z",
      "2026-11-02T19:30:00.000Z",
    ]); // 22:00 Mon and 01:00 Tue
  });

  it("India has no daylight saving: a slot in March and one in October use the same offset", () => {
    for (const date of ["2026-03-30", "2026-10-26"]) {
      const slots = generateSlots(
        query({
          rules: [rule({ endTime: "09:30" })],
          fromDate: date,
          toDate: date,
          now: new Date("2026-01-01T00:00:00Z"),
          maxHorizonDays: 400,
        }),
      );
      expect(slots[0]?.startAt).toBe(`${date}T03:30:00.000Z`);
    }
  });
});

describe("bad input is never turned into slots", () => {
  it("an impossible date, a reversed window, or malformed times give nothing", () => {
    expect(generateSlots(query({ fromDate: "2026-02-30", toDate: "2026-03-01" }))).toEqual([]);
    expect(generateSlots(query({ fromDate: "2026-11-03", toDate: "2026-11-02" }))).toEqual([]);
    expect(generateSlots(query({ rules: [rule({ startTime: "9am" })] }))).toEqual([]);
    expect(
      generateSlots(query({ rules: [rule({ startTime: "11:00", endTime: "09:00" })] })),
    ).toEqual([]);
    expect(generateSlots(query({ rules: [rule({ slotMinutes: 0 })] }))).toEqual([]);
  });

  it("two rules that clash by mistake still give each start once", () => {
    const twice = query({ rules: [rule(), rule({ startTime: "10:00", endTime: "11:30" })] });
    expect(starts(twice)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
});

describe("helpers", () => {
  it("reads times and dates", () => {
    expect(minutesOfDay("09:30")).toBe(570);
    expect(minutesOfDay("24:00:00")).toBe(1440);
    expect(minutesOfDay("24:01")).toBeNull();
    expect(minutesOfDay("12:60")).toBeNull();
    expect(istMidnight("2026-11-02")?.toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(istMidnight("2026-13-01")).toBeNull();
    expect(istDate(new Date("2026-11-01T18:30:00Z"))).toBe("2026-11-02");
    expect(istDate(new Date("2026-11-01T18:29:59Z"))).toBe("2026-11-01");
  });
});
