import type { Queryable, TxRunner } from "../../lib/db/queryable";

// Consultation queries (P6-03, P6-04). Only this file talks to the database for consultations.

export type JoinAppointment = {
  id: string;
  status: string;
  startAt: Date;
  endAt: Date;
  patientId: string;
  patientAccountUserId: string;
  doctorUserId: string | null;
  /** A payment for this appointment holds money (captured, even if partly refunded). */
  paid: boolean;
};

/** What the doctor's console shows, as stored. The reason is still encrypted here. */
export type ConsoleRow = {
  appointmentId: string;
  status: string;
  startAt: Date;
  endAt: Date;
  reasonEnc: string | null;
  attendingAdultName: string | null;
  attendingAdultRelation: string | null;
  patientId: string;
  patientAccountUserId: string;
  patientName: string;
  dob: string;
  gender: string;
  relation: string;
  isMinor: boolean;
  doctorUserId: string | null;
  doctorName: string;
  doctorQualifications: string;
  doctorRegistrationNo: string;
  doctorCouncil: string;
};

export type ConsultationRow = {
  id: string;
  appointmentId: string;
  roomRef: string;
  status: string;
};

export type ParticipantRow = {
  id: string;
  consultationId: string;
  userId: string;
  role: string;
  providerUid: number;
  revokedAt: Date | null;
};

function toParticipant(r: Record<string, unknown>): ParticipantRow {
  return {
    id: String(r.id),
    consultationId: String(r.consultation_id),
    userId: String(r.user_id),
    role: String(r.role),
    providerUid: Number(r.provider_uid),
    revokedAt: r.revoked_at === null ? null : new Date(String(r.revoked_at)),
  };
}

const PARTICIPANT_COLUMNS = "id, consultation_id, user_id, role, provider_uid, revoked_at";

export class ConsultationRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  async appointmentForJoin(id: string): Promise<JoinAppointment | null> {
    const { rows } = await this.db.query(
      `SELECT a.id, a.status, a.start_at, a.end_at, a.patient_id, p.account_user_id, d.user_id AS doctor_user_id,
              EXISTS (SELECT 1 FROM payments pay WHERE pay.appointment_id = a.id
                       AND pay.status IN ('captured', 'partially_refunded')) AS paid
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN doctors d ON d.id = a.doctor_id
        WHERE a.id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      status: String(r.status),
      startAt: new Date(String(r.start_at)),
      endAt: new Date(String(r.end_at)),
      patientId: String(r.patient_id),
      patientAccountUserId: String(r.account_user_id),
      doctorUserId: r.doctor_user_id === null ? null : String(r.doctor_user_id),
      paid: r.paid === true,
    };
  }

  /** The patient and doctor details for the console, for any appointment (the service decides who may see it). */
  async consoleRow(appointmentId: string): Promise<ConsoleRow | null> {
    const { rows } = await this.db.query(
      `SELECT a.id, a.status, a.start_at, a.end_at, a.reason_enc, a.attending_adult_name,
              a.attending_adult_relation, p.id AS patient_id, p.account_user_id, p.full_name,
              p.dob::text AS dob, p.gender, p.relation, p.is_minor, d.user_id AS doctor_user_id,
              d.display_name, d.qualifications, d.registration_no, d.registration_council
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN doctors d ON d.id = a.doctor_id
        WHERE a.id = $1`,
      [appointmentId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      appointmentId: String(r.id),
      status: String(r.status),
      startAt: new Date(String(r.start_at)),
      endAt: new Date(String(r.end_at)),
      reasonEnc: r.reason_enc === null ? null : String(r.reason_enc),
      attendingAdultName: r.attending_adult_name === null ? null : String(r.attending_adult_name),
      attendingAdultRelation:
        r.attending_adult_relation === null ? null : String(r.attending_adult_relation),
      patientId: String(r.patient_id),
      patientAccountUserId: String(r.account_user_id),
      patientName: String(r.full_name),
      dob: String(r.dob),
      gender: String(r.gender),
      relation: String(r.relation),
      isMinor: r.is_minor === true,
      doctorUserId: r.doctor_user_id === null ? null : String(r.doctor_user_id),
      doctorName: String(r.display_name),
      doctorQualifications: String(r.qualifications),
      doctorRegistrationNo: String(r.registration_no),
      doctorCouncil: String(r.registration_council),
    };
  }

  async findByAppointment(appointmentId: string): Promise<ConsultationRow | null> {
    const { rows } = await this.db.query(
      "SELECT id, appointment_id, provider_room_ref, status FROM consultations WHERE appointment_id = $1",
      [appointmentId],
    );
    const r = rows[0];
    return r
      ? {
          id: String(r.id),
          appointmentId: String(r.appointment_id),
          roomRef: String(r.provider_room_ref),
          status: String(r.status),
        }
      : null;
  }

  /** Makes the consultation for an appointment, once. Two joins at the same moment get the same one. */
  async ensureConsultation(input: {
    id: string;
    appointmentId: string;
    provider: string;
    roomRef: string;
  }): Promise<ConsultationRow> {
    await this.db.query(
      `INSERT INTO consultations (id, appointment_id, provider, provider_room_ref)
       VALUES ($1, $2, $3, $4) ON CONFLICT (appointment_id) DO NOTHING`,
      [input.id, input.appointmentId, input.provider, input.roomRef],
    );
    const found = await this.findByAppointment(input.appointmentId);
    if (!found) throw new Error("consultation missing after insert");
    return found;
  }

  /**
   * This person's seat in the consultation, made once with the given provider number. Returns the
   * existing seat if there is one. A number already used by someone else in this consultation
   * raises 23505 on consultation_participants_uid_idx, and the caller picks another.
   */
  async ensureParticipant(input: {
    id: string;
    consultationId: string;
    userId: string;
    role: "patient" | "doctor";
    providerUid: number;
  }): Promise<ParticipantRow> {
    await this.db.query(
      `INSERT INTO consultation_participants (id, consultation_id, user_id, role, provider_uid)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (consultation_id, user_id) DO NOTHING`,
      [input.id, input.consultationId, input.userId, input.role, input.providerUid],
    );
    const { rows } = await this.db.query(
      `SELECT ${PARTICIPANT_COLUMNS} FROM consultation_participants WHERE consultation_id = $1 AND user_id = $2`,
      [input.consultationId, input.userId],
    );
    if (!rows[0]) throw new Error("participant missing after insert");
    return toParticipant(rows[0]);
  }

  /** A token was issued: remember when it lapses, and when the person first came in. */
  async markJoined(participantId: string, tokenExpiresAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE consultation_participants
          SET joined_at = COALESCE(joined_at, now()), left_at = NULL, token_expires_at = $2
        WHERE id = $1 AND revoked_at IS NULL`,
      [participantId, tokenExpiresAt],
    );
  }

  /**
   * The doctor is in: the consultation goes live and the appointment is in progress, together.
   * Only from "pending" and "scheduled", so a repeat changes nothing.
   */
  async startLive(
    consultationId: string,
    appointmentId: string,
    doctorUserId: string,
  ): Promise<void> {
    await this.tx.transaction(async (q) => {
      const live = await q.query(
        "UPDATE consultations SET status = 'live', started_at = now() WHERE id = $1 AND status = 'pending' RETURNING id",
        [consultationId],
      );
      if (live.rows.length === 0) return;
      await q.query(
        `WITH moved AS (
           UPDATE appointments SET status = 'in_progress'
            WHERE id = $1 AND status = 'scheduled' RETURNING id
         )
         INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
         SELECT id, 'scheduled', 'in_progress', $2, 'consultation_started' FROM moved`,
        [appointmentId, doctorUserId],
      );
    });
  }

  /** One person's seat with the consultation's and appointment's state, for renewing a token. */
  async seatFor(
    appointmentId: string,
    userId: string,
  ): Promise<
    | (ParticipantRow & { consultationStatus: string; roomRef: string; appointmentStatus: string })
    | null
  > {
    const { rows } = await this.db.query(
      `SELECT cp.id, cp.consultation_id, cp.user_id, cp.role, cp.provider_uid, cp.revoked_at,
              c.status AS consultation_status, c.provider_room_ref, a.status AS appointment_status
         FROM consultation_participants cp
         JOIN consultations c ON c.id = cp.consultation_id
         JOIN appointments a ON a.id = c.appointment_id
        WHERE c.appointment_id = $1 AND cp.user_id = $2`,
      [appointmentId, userId],
    );
    const r = rows[0];
    return r
      ? {
          ...toParticipant(r),
          consultationStatus: String(r.consultation_status),
          roomRef: String(r.provider_room_ref),
          appointmentStatus: String(r.appointment_status),
        }
      : null;
  }

  /**
   * The doctor ends the consultation: it is closed (ended if it ever went live, abandoned if it
   * never did), every seat is revoked so no token can be renewed, and a live appointment is
   * completed. All in one transaction. Returns the final state, or null when it was already over.
   */
  async end(
    consultationId: string,
    appointmentId: string,
    byUserId: string,
  ): Promise<"ended" | "abandoned" | null> {
    return this.tx.transaction(async (q) => {
      const closed = await q.query(
        `UPDATE consultations
            SET status = CASE WHEN status = 'live' THEN 'ended' ELSE 'abandoned' END, ended_at = now()
          WHERE id = $1 AND status IN ('pending', 'live') RETURNING status`,
        [consultationId],
      );
      const status = closed.rows[0] ? String(closed.rows[0].status) : null;
      if (!status) return null;
      await q.query(
        `UPDATE consultation_participants
            SET revoked_at = now(), left_at = CASE WHEN joined_at IS NOT NULL AND left_at IS NULL THEN now() ELSE left_at END
          WHERE consultation_id = $1 AND revoked_at IS NULL`,
        [consultationId],
      );
      if (status === "ended") {
        await q.query(
          `WITH moved AS (
             UPDATE appointments SET status = 'completed'
              WHERE id = $1 AND status = 'in_progress' RETURNING id
           )
           INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
           SELECT id, 'in_progress', 'completed', $2, 'consultation_ended' FROM moved`,
          [appointmentId, byUserId],
        );
      }
      return status as "ended" | "abandoned";
    });
  }
}
