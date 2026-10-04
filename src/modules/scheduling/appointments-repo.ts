import type { Queryable } from "../../lib/db/queryable";
import type { Interval } from "./slots";

// Appointment queries. Only this file talks to the database for appointments.

export type AppointmentRow = {
  id: string;
  patientId: string;
  doctorId: string;
  bookedByUserId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  feePaise: number;
  holdExpiresAt: Date | null;
  createdAt: Date;
};

const COLUMNS =
  "a.id, a.patient_id, a.doctor_id, a.booked_by_user_id, a.start_at, a.end_at, a.status," +
  " a.fee_paise, a.hold_expires_at, a.created_at";

function toRow(r: Record<string, unknown>): AppointmentRow {
  return {
    id: String(r.id),
    patientId: String(r.patient_id),
    doctorId: String(r.doctor_id),
    bookedByUserId: String(r.booked_by_user_id),
    startAt: new Date(String(r.start_at)),
    endAt: new Date(String(r.end_at)),
    status: String(r.status),
    feePaise: Number(r.fee_paise),
    holdExpiresAt: r.hold_expires_at === null ? null : new Date(String(r.hold_expires_at)),
    createdAt: new Date(String(r.created_at)),
  };
}

export type NewHold = {
  id: string;
  patientId: string;
  doctorId: string;
  bookedByUserId: string;
  startAt: Date;
  endAt: Date;
  holdSeconds: number;
  maxActiveHolds: number;
  reasonEnc: string | null;
  attendingAdultName: string | null;
  attendingAdultRelation: string | null;
};

export class AppointmentRepo {
  constructor(private readonly db: Queryable) {}

  /** Time that is taken: scheduled, in progress, or held and not yet expired. */
  async activeIntervals(doctorId: string, from: Date, to: Date): Promise<Interval[]> {
    const { rows } = await this.db.query(
      `SELECT start_at, end_at FROM appointments
        WHERE doctor_id = $1 AND start_at < $3 AND end_at > $2
          AND (status IN ('scheduled', 'in_progress')
               OR (status = 'held' AND hold_expires_at > now()))`,
      [doctorId, from, to],
    );
    return rows.map((r) => ({
      start: new Date(String(r.start_at)),
      end: new Date(String(r.end_at)),
    }));
  }

  /**
   * Frees the slot from holds that have run out, so the new hold is not blocked by a ghost.
   * Each change is written to the history in the same statement. Safe to repeat.
   */
  async expireStaleHolds(doctorId: string, from: Date, to: Date): Promise<number> {
    const { rows } = await this.db.query(
      `WITH gone AS (
         UPDATE appointments SET status = 'expired', hold_expires_at = NULL
          WHERE doctor_id = $1 AND status = 'held' AND hold_expires_at <= now()
            AND start_at < $3 AND end_at > $2
          RETURNING id
       ), logged AS (
         INSERT INTO appointment_status_history (appointment_id, from_status, to_status, reason)
         SELECT id, 'held', 'expired', 'hold ran out' FROM gone
       )
       SELECT id FROM gone`,
      [doctorId, from, to],
    );
    return rows.length;
  }

  /**
   * Holds a slot in one statement: copies the doctor's current fee, refuses past the cap of
   * open holds per account, inserts, and writes the first history row. Returns null when the
   * doctor is not listed or the cap is reached. A taken slot raises the database's exclusion
   * error (23P01, no_double_booking), which the service turns into 409.
   */
  async createHold(h: NewHold): Promise<AppointmentRow | null> {
    const { rows } = await this.db.query(
      `WITH doc AS (
         SELECT consultation_fee_paise FROM doctors
          WHERE id = $3 AND status = 'active' AND kyc_status = 'approved'
       ), ins AS (
         INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at,
                                   status, fee_paise, hold_expires_at, reason_enc,
                                   attending_adult_name, attending_adult_relation)
         SELECT $1, $2, $3, $4, $5, $6, 'held', doc.consultation_fee_paise,
                now() + make_interval(secs => $7), $9, $10, $11
           FROM doc
          WHERE (SELECT count(*) FROM appointments
                  WHERE booked_by_user_id = $4 AND status = 'held' AND hold_expires_at > now()) < $8
         RETURNING id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status,
                   fee_paise, hold_expires_at, created_at
       ), logged AS (
         INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by)
         SELECT id, NULL, 'held', $4 FROM ins
       )
       SELECT id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status,
              fee_paise, hold_expires_at, created_at FROM ins`,
      [
        h.id,
        h.patientId,
        h.doctorId,
        h.bookedByUserId,
        h.startAt,
        h.endAt,
        h.holdSeconds,
        h.maxActiveHolds,
        h.reasonEnc,
        h.attendingAdultName,
        h.attendingAdultRelation,
      ],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async findById(id: string): Promise<AppointmentRow | null> {
    const { rows } = await this.db.query(`SELECT ${COLUMNS} FROM appointments a WHERE a.id = $1`, [
      id,
    ]);
    return rows[0] ? toRow(rows[0]) : null;
  }
}
