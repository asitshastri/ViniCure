import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { MAX_FUTURE_TIME_OFF, type HoursView } from "./availability-schemas";

// A doctor's working hours and time off. Only this file talks to the database for them.

export class AvailabilityRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  /** The doctor record that belongs to this account, if any. */
  async doctorOfUser(userId: string): Promise<{ id: string; userId: string } | null> {
    const { rows } = await this.db.query("SELECT id, user_id FROM doctors WHERE user_id = $1", [
      userId,
    ]);
    return rows[0] ? { id: String(rows[0].id), userId: String(rows[0].user_id) } : null;
  }

  /** The hours in force today or later. */
  async currentRules(doctorId: string, today: string): Promise<HoursView["rules"]> {
    const { rows } = await this.db.query(
      `SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
              slot_minutes
         FROM doctor_availability_rules
        WHERE doctor_id = $1 AND (valid_to IS NULL OR valid_to >= $2::date)
        ORDER BY weekday, start_time`,
      [doctorId, today],
    );
    return rows.map((r) => ({
      weekday: Number(r.weekday),
      startTime: String(r.start_time),
      // Postgres prints a 24:00 end as 00:00; an end can never be before its start, so it was 24:00.
      endTime: String(r.end_time) === "00:00" ? "24:00" : String(r.end_time),
      slotMinutes: Number(r.slot_minutes),
    }));
  }

  /** Replaces all of the doctor's hours with the new set, in one transaction. */
  async replaceRules(
    doctorId: string,
    rules: HoursView["rules"],
    validFrom: string,
    newId: () => string,
  ): Promise<void> {
    await this.tx.transaction(async (q) => {
      await q.query("DELETE FROM doctor_availability_rules WHERE doctor_id = $1", [doctorId]);
      for (const r of rules) {
        await q.query(
          `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newId(), doctorId, r.weekday, r.startTime, r.endTime, r.slotMinutes, validFrom],
        );
      }
    });
  }

  async listTimeOff(
    doctorId: string,
    now: Date,
  ): Promise<{ id: string; startAt: Date; endAt: Date; reason: string | null }[]> {
    const { rows } = await this.db.query(
      `SELECT id, start_at, end_at, reason FROM doctor_time_off
        WHERE doctor_id = $1 AND end_at > $2 ORDER BY start_at, id LIMIT 100`,
      [doctorId, now],
    );
    return rows.map((r) => ({
      id: String(r.id),
      startAt: new Date(String(r.start_at)),
      endAt: new Date(String(r.end_at)),
      reason: r.reason === null ? null : String(r.reason),
    }));
  }

  /** Adds time off unless the doctor already has the maximum ahead. False at the limit. */
  async addTimeOff(input: {
    id: string;
    doctorId: string;
    startAt: Date;
    endAt: Date;
    reason: string | null;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO doctor_time_off (id, doctor_id, start_at, end_at, reason)
       SELECT $1, $2, $3, $4, $5
        WHERE (SELECT count(*) FROM doctor_time_off WHERE doctor_id = $2 AND end_at > now()) < $6
       RETURNING id`,
      [input.id, input.doctorId, input.startAt, input.endAt, input.reason, MAX_FUTURE_TIME_OFF],
    );
    return rows.length === 1;
  }

  async removeTimeOff(id: string, doctorId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "DELETE FROM doctor_time_off WHERE id = $1 AND doctor_id = $2 RETURNING id",
      [id, doctorId],
    );
    return rows.length === 1;
  }

  /** Bookings (confirmed, in progress, or held and live) that fall inside a stretch of time off. */
  async bookedBetween(doctorId: string, from: Date, to: Date): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT count(*)::int AS n FROM appointments
        WHERE doctor_id = $1 AND start_at < $3 AND end_at > $2
          AND (status IN ('scheduled', 'in_progress') OR (status = 'held' AND hold_expires_at > now()))`,
      [doctorId, from, to],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
