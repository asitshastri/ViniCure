import type { Queryable } from "../../lib/db/queryable";
import type { AvailabilityRule, Interval } from "./slots";

// Queries for the slot list. Only this file talks to the database for scheduling reads.

export class SchedulingRepo {
  constructor(private readonly db: Queryable) {}

  /** A doctor is bookable only when approved and active. */
  async isListed(doctorId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "SELECT 1 FROM doctors WHERE id = $1 AND status = 'active' AND kyc_status = 'approved'",
      [doctorId],
    );
    return rows.length === 1;
  }

  /** Rules that can apply in the window: they start before it ends and have not ended before it starts. */
  async rulesFor(doctorId: string, fromDate: string, toDate: string): Promise<AvailabilityRule[]> {
    const { rows } = await this.db.query(
      `SELECT weekday, to_char(start_time, 'HH24:MI:SS') AS start_time,
              to_char(end_time, 'HH24:MI:SS') AS end_time, slot_minutes,
              to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
              to_char(valid_to, 'YYYY-MM-DD') AS valid_to
         FROM doctor_availability_rules
        WHERE doctor_id = $1 AND valid_from <= $3::date AND (valid_to IS NULL OR valid_to >= $2::date)
        ORDER BY weekday, start_time`,
      [doctorId, fromDate, toDate],
    );
    return rows.map((r) => ({
      weekday: Number(r.weekday),
      startTime: String(r.start_time),
      // Postgres prints a 24:00 end as 00:00:00; the rule table forbids end <= start, so a zero
      // end can only have been 24:00.
      endTime: String(r.end_time) === "00:00:00" ? "24:00:00" : String(r.end_time),
      slotMinutes: Number(r.slot_minutes),
      validFrom: String(r.valid_from),
      validTo: r.valid_to === null ? null : String(r.valid_to),
    }));
  }

  async timeOffBetween(doctorId: string, from: Date, to: Date): Promise<Interval[]> {
    const { rows } = await this.db.query(
      `SELECT start_at, end_at FROM doctor_time_off
        WHERE doctor_id = $1 AND start_at < $3 AND end_at > $2 ORDER BY start_at`,
      [doctorId, from, to],
    );
    return rows.map((r) => ({
      start: new Date(String(r.start_at)),
      end: new Date(String(r.end_at)),
    }));
  }
}
