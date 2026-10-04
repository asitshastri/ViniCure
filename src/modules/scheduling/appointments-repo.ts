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

export type AppointmentDetail = AppointmentRow & {
  doctorName: string;
  doctorUserId: string | null;
  patientName: string;
  patientAccountUserId: string;
  rescheduleCount: number;
  /** start_at with full precision, for the page cursor. */
  cursorTime: string;
};

const DETAIL_COLUMNS =
  COLUMNS +
  ", d.display_name AS doctor_name, d.user_id AS doctor_user_id, p.full_name AS patient_name," +
  " p.account_user_id AS patient_account_user_id, a.reschedule_count," +
  " to_char(a.start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS cursor_time";
const DETAIL_FROM =
  " FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN patients p ON p.id = a.patient_id";

function toDetail(r: Record<string, unknown>): AppointmentDetail {
  return {
    ...toRow(r),
    doctorName: String(r.doctor_name),
    doctorUserId: r.doctor_user_id === null ? null : String(r.doctor_user_id),
    patientName: String(r.patient_name),
    patientAccountUserId: String(r.patient_account_user_id),
    rescheduleCount: Number(r.reschedule_count),
    cursorTime: String(r.cursor_time),
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

  // ---- reading ----

  /** One appointment with who it is for and who it is with. The caller decides access. */
  async findDetail(id: string): Promise<AppointmentDetail | null> {
    const { rows } = await this.db.query(
      "SELECT " + DETAIL_COLUMNS + DETAIL_FROM + " WHERE a.id = $1",
      [id],
    );
    return rows[0] ? toDetail(rows[0]) : null;
  }

  /** Bookings for the people on one account, newest first, after a (start, id) cursor. */
  async listForAccount(input: {
    accountUserId: string;
    after?: { key: string; id: string };
    limit: number;
  }): Promise<AppointmentDetail[]> {
    const params: unknown[] = [input.accountUserId];
    let cursor = "";
    if (input.after) {
      params.push(input.after.key, input.after.id);
      cursor = " AND (a.start_at, a.id) < ($2::timestamptz, $3::uuid)";
    }
    params.push(input.limit);
    const { rows } = await this.db.query(
      "SELECT " +
        DETAIL_COLUMNS +
        DETAIL_FROM +
        " WHERE p.account_user_id = $1 AND a.status <> 'expired'" +
        cursor +
        " ORDER BY a.start_at DESC, a.id DESC LIMIT $" +
        String(params.length),
      params,
    );
    return rows.map(toDetail);
  }

  /** A doctor's confirmed, not yet finished appointments, soonest first. */
  async listForDoctor(input: {
    doctorUserId: string;
    after?: { key: string; id: string };
    limit: number;
  }): Promise<AppointmentDetail[]> {
    const params: unknown[] = [input.doctorUserId];
    let cursor = "";
    if (input.after) {
      params.push(input.after.key, input.after.id);
      cursor = " AND (a.start_at, a.id) > ($2::timestamptz, $3::uuid)";
    }
    params.push(input.limit);
    const { rows } = await this.db.query(
      "SELECT " +
        DETAIL_COLUMNS +
        DETAIL_FROM +
        " WHERE d.user_id = $1 AND a.status IN ('scheduled', 'in_progress') AND a.end_at > now()" +
        cursor +
        " ORDER BY a.start_at, a.id LIMIT $" +
        String(params.length),
      params,
    );
    return rows.map(toDetail);
  }

  // ---- changing ----

  /**
   * Moves an appointment to a new status only if it is still in `from`, and writes the history
   * row in the same statement. False when someone else moved it first.
   */
  async transition(input: {
    id: string;
    from: string;
    to: string;
    changedBy: string | null;
    reason: string | null;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `WITH moved AS (
         UPDATE appointments SET status = $3, hold_expires_at = NULL
          WHERE id = $1 AND status = $2 RETURNING id
       ), logged AS (
         INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
         SELECT id, $2, $3, $4, $5 FROM moved
       )
       SELECT id FROM moved`,
      [input.id, input.from, input.to, input.changedBy, input.reason],
    );
    return rows.length === 1;
  }

  /**
   * Moves a confirmed appointment to another time of the same doctor. Applies only while it is
   * still scheduled, has not started, and has been moved fewer than `maxReschedules` times. A
   * taken time raises the exclusion error (23P01). The history row is written with it.
   */
  async reschedule(input: {
    id: string;
    startAt: Date;
    endAt: Date;
    changedBy: string;
    maxReschedules: number;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `WITH moved AS (
         UPDATE appointments
            SET start_at = $2, end_at = $3, reschedule_count = reschedule_count + 1
          WHERE id = $1 AND status = 'scheduled' AND start_at > now() AND reschedule_count < $5
          RETURNING id
       ), logged AS (
         INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
         SELECT id, 'scheduled', 'scheduled', $4, 'rescheduled' FROM moved
       )
       SELECT id FROM moved`,
      [input.id, input.startAt, input.endAt, input.changedBy, input.maxReschedules],
    );
    return rows.length === 1;
  }
}
