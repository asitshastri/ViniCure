import { cursorTimeSql } from "../../lib/cursor";
import type { Queryable } from "../../lib/db/queryable";
import { MAX_FAVORITES } from "./schemas";

// Review and favorite queries. Only this file talks to the database for them.

export type ReviewRow = {
  id: string;
  appointmentId: string;
  doctorId: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: Date;
  cursorTime: string;
};

const CURSOR_TIME = cursorTimeSql("created_at");
const COLUMNS =
  "r.id, r.appointment_id, r.doctor_id, r.rating, r.comment, r.status, r.created_at, " +
  cursorTimeSql("r.created_at") +
  " AS cursor_time";

function toReview(r: Record<string, unknown>): ReviewRow {
  return {
    id: String(r.id),
    appointmentId: String(r.appointment_id),
    doctorId: String(r.doctor_id),
    rating: Number(r.rating),
    comment: r.comment === null ? null : String(r.comment),
    status: String(r.status),
    createdAt: new Date(String(r.created_at)),
    cursorTime: String(r.cursor_time),
  };
}

export type ReviewableAppointment = {
  id: string;
  status: string;
  doctorId: string;
  patientId: string;
  accountUserId: string;
};

export class EngagementRepo {
  constructor(private readonly db: Queryable) {}

  async appointmentForReview(id: string): Promise<ReviewableAppointment | null> {
    const { rows } = await this.db.query(
      `SELECT a.id, a.status, a.doctor_id, a.patient_id, p.account_user_id
         FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`,
      [id],
    );
    const r = rows[0];
    return r
      ? {
          id: String(r.id),
          status: String(r.status),
          doctorId: String(r.doctor_id),
          patientId: String(r.patient_id),
          accountUserId: String(r.account_user_id),
        }
      : null;
  }

  /**
   * Adds the review of a completed appointment, once. Returns null when the appointment already
   * has one or is not completed (the statement itself checks, so a race cannot slip through).
   */
  async createReview(input: {
    id: string;
    appointmentId: string;
    authorUserId: string;
    rating: number;
    comment: string | null;
  }): Promise<ReviewRow | null> {
    const { rows } = await this.db.query(
      `WITH ins AS (
         INSERT INTO reviews (id, appointment_id, doctor_id, patient_id, author_user_id, rating, comment)
         SELECT $1, a.id, a.doctor_id, a.patient_id, $3, $4, $5
           FROM appointments a WHERE a.id = $2 AND a.status = 'completed'
         ON CONFLICT (appointment_id) DO NOTHING
         RETURNING id, appointment_id, doctor_id, rating, comment, status, created_at
       )
       SELECT id, appointment_id, doctor_id, rating, comment, status, created_at,
              ` +
        CURSOR_TIME +
        ` AS cursor_time FROM ins`,
      [input.id, input.appointmentId, input.authorUserId, input.rating, input.comment],
    );
    return rows[0] ? toReview(rows[0]) : null;
  }

  async findForAppointment(appointmentId: string): Promise<ReviewRow | null> {
    const { rows } = await this.db.query(
      "SELECT " + COLUMNS + " FROM reviews r WHERE r.appointment_id = $1",
      [appointmentId],
    );
    return rows[0] ? toReview(rows[0]) : null;
  }

  async listPublished(input: {
    doctorId: string;
    after?: { t: string; i: string };
    limit: number;
  }): Promise<ReviewRow[]> {
    const params: unknown[] = [input.doctorId];
    let cursor = "";
    if (input.after) {
      params.push(input.after.t, input.after.i);
      cursor = " AND (r.created_at, r.id) < ($2::timestamptz, $3::uuid)";
    }
    params.push(input.limit);
    const { rows } = await this.db.query(
      "SELECT " +
        COLUMNS +
        " FROM reviews r WHERE r.doctor_id = $1 AND r.status = 'published'" +
        cursor +
        " ORDER BY r.created_at DESC, r.id DESC LIMIT $" +
        String(params.length),
      params,
    );
    return rows.map(toReview);
  }

  async listByStatus(input: {
    status: string;
    after?: { t: string; i: string };
    limit: number;
  }): Promise<ReviewRow[]> {
    const params: unknown[] = [input.status];
    let cursor = "";
    if (input.after) {
      params.push(input.after.t, input.after.i);
      cursor = " AND (r.created_at, r.id) > ($2::timestamptz, $3::uuid)";
    }
    params.push(input.limit);
    const { rows } = await this.db.query(
      "SELECT " +
        COLUMNS +
        " FROM reviews r WHERE r.status = $1" +
        cursor +
        " ORDER BY r.created_at, r.id LIMIT $" +
        String(params.length),
      params,
    );
    return rows.map(toReview);
  }

  /** Publishes or hides a review. Null when it does not exist or is already in that state. */
  async moderate(input: {
    id: string;
    to: "published" | "hidden";
    by: string;
  }): Promise<string | null> {
    const { rows } = await this.db.query(
      `UPDATE reviews SET status = $2, moderated_by = $3, moderated_at = now()
        WHERE id = $1 AND status <> $2 RETURNING doctor_id`,
      [input.id, input.to, input.by],
    );
    return rows[0] ? String(rows[0].doctor_id) : null;
  }

  /** Recomputes the cached average and count from the published reviews. Safe to repeat. */
  async refreshRating(doctorId: string): Promise<void> {
    await this.db.query(
      `UPDATE doctors d SET rating_avg = s.avg, rating_count = s.n
         FROM (SELECT round(avg(rating)::numeric, 2) AS avg, count(*)::int AS n
                 FROM reviews WHERE doctor_id = $1 AND status = 'published') s
        WHERE d.id = $1`,
      [doctorId],
    );
  }

  // ---- favorites ----

  /** Saves a listed doctor for a patient profile, up to the cap. False when nothing was added. */
  async addFavorite(patientId: string, doctorId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO doctor_favorites (patient_id, doctor_id)
       SELECT $1, d.id FROM doctors d
        WHERE d.id = $2 AND d.status = 'active' AND d.kyc_status = 'approved'
          AND (SELECT count(*) FROM doctor_favorites WHERE patient_id = $1) < $3
       ON CONFLICT DO NOTHING RETURNING doctor_id`,
      [patientId, doctorId, MAX_FAVORITES],
    );
    return rows.length === 1;
  }

  async isFavorite(patientId: string, doctorId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "SELECT 1 FROM doctor_favorites WHERE patient_id = $1 AND doctor_id = $2",
      [patientId, doctorId],
    );
    return rows.length === 1;
  }

  async removeFavorite(patientId: string, doctorId: string): Promise<void> {
    await this.db.query("DELETE FROM doctor_favorites WHERE patient_id = $1 AND doctor_id = $2", [
      patientId,
      doctorId,
    ]);
  }

  async favoriteDoctorIds(patientId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      "SELECT doctor_id FROM doctor_favorites WHERE patient_id = $1 ORDER BY created_at DESC, doctor_id LIMIT $2",
      [patientId, MAX_FAVORITES],
    );
    return rows.map((r) => String(r.doctor_id));
  }
}
