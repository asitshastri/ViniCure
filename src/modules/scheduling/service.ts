import type { CacheStore } from "../../lib/cache";
import { cacheKey } from "../../lib/cache";
import { errors } from "../../lib/errors/app-error";
import type { SchedulingRepo } from "./repo";
import { generateSlots, istDate, istMidnight, type Interval, type Slot } from "./slots";

// The slot list for one doctor (P4-04): working hours minus leave minus booked time, cached for
// a few seconds. The cache is only a speed-up: booking (P4-05) is decided by the database
// constraint, so a slightly stale list can never cause a double booking.

/** NOT VERIFIED (TODO.md, Questions): the booking window is a product choice, not law. */
export const MIN_LEAD_MINUTES = 30;
export const MAX_HORIZON_DAYS = 30;
/** One request lists at most this many days. */
export const MAX_WINDOW_DAYS = 14;
export const SLOT_CACHE_TTL_MS = 20_000;

/** Where booked time comes from. Appointments arrive in P4-05, which supplies the real one. */
export type BookedSource = (doctorId: string, from: Date, to: Date) => Promise<Interval[]>;

type Deps = {
  repo: SchedulingRepo;
  cache: () => CacheStore;
  env: string;
  booked?: BookedSource;
  now?: () => Date;
};

const DAY_MS = 86_400_000;

export class SlotService {
  constructor(private readonly deps: Deps) {}

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private genKey(doctorId: string): string {
    return cacheKey(this.deps.env, "slots", "gen", doctorId);
  }

  /** Call when this doctor's hours, leave or bookings change, so lists are rebuilt at once. */
  async invalidate(doctorId: string): Promise<void> {
    await this.deps.cache().incrWindow(this.genKey(doctorId), 24 * 3600_000);
  }

  /** Free slots for a listed doctor between two India dates, inclusive. */
  async list(
    doctorId: string,
    input: { from?: string; to?: string; fresh?: boolean },
  ): Promise<{ slots: Slot[] }> {
    const now = this.now();
    const today = istDate(now);
    const from = input.from ?? today;
    const fromStart = istMidnight(from);
    if (!fromStart)
      throw errors.validation([{ path: "from", message: "Use the format YYYY-MM-DD." }]);
    const to = input.to ?? istDate(new Date(fromStart.getTime() + 6 * DAY_MS));
    const toStart = istMidnight(to);
    if (!toStart) throw errors.validation([{ path: "to", message: "Use the format YYYY-MM-DD." }]);
    if (from < today) {
      throw errors.validation([{ path: "from", message: "Choose today or a later date." }]);
    }
    const days = Math.round((toStart.getTime() - fromStart.getTime()) / DAY_MS) + 1;
    if (days < 1 || days > MAX_WINDOW_DAYS) {
      throw errors.validation([
        { path: "to", message: `Ask for between 1 and ${MAX_WINDOW_DAYS} days at a time.` },
      ]);
    }

    // A doctor who is not listed is a 404, the same as one that does not exist.
    if (!(await this.deps.repo.isListed(doctorId))) throw errors.notFound();

    const cache = this.deps.cache();
    const gen = (await cache.peekWindow(this.genKey(doctorId))).count;
    const key = cacheKey(this.deps.env, "slots", doctorId, String(gen), from, to);
    const hit = input.fresh ? null : await cache.get(key);
    if (hit) {
      try {
        return { slots: JSON.parse(hit) as Slot[] };
      } catch {
        // A damaged entry is ignored and rebuilt.
      }
    }

    const windowEnd = new Date(toStart.getTime() + DAY_MS);
    const [rules, timeOff, booked] = await Promise.all([
      this.deps.repo.rulesFor(doctorId, from, to),
      this.deps.repo.timeOffBetween(doctorId, fromStart, windowEnd),
      (this.deps.booked ?? (async () => []))(doctorId, fromStart, windowEnd),
    ]);
    const slots = generateSlots({
      rules,
      timeOff,
      booked,
      fromDate: from,
      toDate: to,
      now,
      minLeadMinutes: MIN_LEAD_MINUTES,
      maxHorizonDays: MAX_HORIZON_DAYS,
    });
    if (!input.fresh) {
      await cache.set(key, JSON.stringify(slots), SLOT_CACHE_TTL_MS).catch(() => undefined);
    }
    return { slots };
  }
}
