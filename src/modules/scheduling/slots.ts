// Slot generation (P4-04). A pure function: working-hours rules, minus time off, minus booked
// intervals, inside a window of India dates. No database, no clock of its own, so every edge
// can be tested.
//
// Time rules:
//   - Rules hold India wall-clock times (Asia/Kolkata, a fixed +05:30 with no daylight saving),
//     so a rule is turned into UTC instants with one fixed offset.
//   - Weekday 0 = Sunday, the same numbering as Postgres `dow` and JavaScript getUTCDay.
//   - An end time of 24:00 means midnight at the end of that day.
//   - All intervals are half-open [start, end): a slot that ends exactly when leave begins, or
//     starts exactly when another booking ends, does not overlap it.

export const IST_OFFSET_MINUTES = 330;
const MINUTE = 60_000;
const DAY_MINUTES = 1440;

export type AvailabilityRule = {
  weekday: number;
  /** "HH:MM" or "HH:MM:SS". */
  startTime: string;
  /** "HH:MM", "HH:MM:SS" or "24:00:00". */
  endTime: string;
  slotMinutes: number;
  /** India dates, "YYYY-MM-DD". validTo null means no end. */
  validFrom: string;
  validTo: string | null;
};

export type Interval = { start: Date; end: Date };
export type Slot = { startAt: string; endAt: string };

export type SlotQuery = {
  rules: readonly AvailabilityRule[];
  timeOff: readonly Interval[];
  /** Held, scheduled and in-progress appointments of this doctor. */
  booked: readonly Interval[];
  /** First and last India date to list, inclusive. */
  fromDate: string;
  toDate: string;
  now: Date;
  /** A slot starting sooner than this from now is not offered. */
  minLeadMinutes: number;
  /** A slot starting later than this from now is not offered. */
  maxHorizonDays: number;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The UTC instant of 00:00 India time on a date, or null when the text is not a real date. */
export function istMidnight(date: string): Date | null {
  const m = DATE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) {
    return null;
  }
  return new Date(utc.getTime() - IST_OFFSET_MINUTES * MINUTE);
}

/** The India date of an instant, "YYYY-MM-DD". */
export function istDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MINUTES * MINUTE).toISOString().slice(0, 10);
}

/** Minutes after midnight for "HH:MM[:SS]". "24:00[:00]" is 1440. Returns null if malformed. */
export function minutesOfDay(time: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!m) return null;
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (min > 59 || sec > 59) return null;
  const total = h * 60 + min;
  if (h > 24 || total > DAY_MINUTES || (total === DAY_MINUTES && sec > 0)) return null;
  return total;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

export function generateSlots(query: SlotQuery): Slot[] {
  const first = istMidnight(query.fromDate);
  const last = istMidnight(query.toDate);
  if (!first || !last || last < first) return [];

  const earliest = query.now.getTime() + query.minLeadMinutes * MINUTE;
  const latest = query.now.getTime() + query.maxHorizonDays * DAY_MINUTES * MINUTE;
  const blocked = [...query.timeOff, ...query.booked];
  const out = new Map<number, Slot>();

  for (let day = first.getTime(); day <= last.getTime(); day += DAY_MINUTES * MINUTE) {
    const date = istDate(new Date(day));
    // The weekday of the India date, not of the UTC instant.
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const rule of query.rules) {
      if (rule.weekday !== weekday) continue;
      if (rule.validFrom > date || (rule.validTo !== null && rule.validTo < date)) continue;
      const from = minutesOfDay(rule.startTime);
      const to = minutesOfDay(rule.endTime);
      if (from === null || to === null || to <= from || rule.slotMinutes <= 0) continue;
      for (let at = from; at + rule.slotMinutes <= to; at += rule.slotMinutes) {
        const start = new Date(day + at * MINUTE);
        const end = new Date(start.getTime() + rule.slotMinutes * MINUTE);
        if (start.getTime() < earliest || start.getTime() > latest) continue;
        if (blocked.some((b) => overlaps({ start, end }, b))) continue;
        // Two rules for the same day cannot overlap (the database forbids it); if bad data
        // ever did, the same start is offered once.
        out.set(start.getTime(), { startAt: start.toISOString(), endAt: end.toISOString() });
      }
    }
  }
  return [...out.entries()].sort(([a], [b]) => a - b).map(([, slot]) => slot);
}
