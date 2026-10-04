import type { Queryable, TxRunner } from "../../lib/db/queryable";

// Recording queries (P6-08). Only this file talks to the database for consultation recordings.

/** The consultation behind an appointment, with the two people who may be in it. */
export type RecordingContext = {
  consultationId: string;
  consultationStatus: string;
  roomRef: string;
  appointmentId: string;
  patientId: string;
  patientAccountUserId: string;
  /** Someone other than the account holder is the patient (a child or relative). */
  onBehalf: boolean;
  doctorUserId: string | null;
};

export type RecordingPolicy = { id: string; version: string; language: string; body: string };

export type RecordingRow = {
  id: string;
  consultationId: string;
  status: string;
  providerRef: string | null;
  objectKey: string | null;
  fileId: string | null;
  patientId: string;
  doctorUserId: string | null;
};

function toRow(r: Record<string, unknown>): RecordingRow {
  return {
    id: String(r.id),
    consultationId: String(r.consultation_id),
    status: String(r.status),
    providerRef: r.provider_recording_ref === null ? null : String(r.provider_recording_ref),
    objectKey: r.object_key === null ? null : String(r.object_key),
    fileId: r.file_id === null ? null : String(r.file_id),
    patientId: String(r.patient_id),
    doctorUserId: r.doctor_user_id === null ? null : String(r.doctor_user_id),
  };
}

export class RecordingRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  /** The consultation for an appointment, once someone has joined. Null before that. */
  async contextByAppointment(appointmentId: string): Promise<RecordingContext | null> {
    const { rows } = await this.db.query(
      `SELECT c.id, c.status, c.provider_room_ref, a.id AS appointment_id, a.patient_id,
              p.account_user_id, (p.relation <> 'self' OR p.is_minor) AS on_behalf,
              d.user_id AS doctor_user_id
         FROM consultations c
         JOIN appointments a ON a.id = c.appointment_id
         JOIN patients p ON p.id = a.patient_id
         JOIN doctors d ON d.id = a.doctor_id
        WHERE a.id = $1`,
      [appointmentId],
    );
    const r = rows[0];
    return r
      ? {
          consultationId: String(r.id),
          consultationStatus: String(r.status),
          roomRef: String(r.provider_room_ref),
          appointmentId: String(r.appointment_id),
          patientId: String(r.patient_id),
          patientAccountUserId: String(r.account_user_id),
          onBehalf: r.on_behalf === true,
          doctorUserId: r.doctor_user_id === null ? null : String(r.doctor_user_id),
        }
      : null;
  }

  /** The recording text in force: the newest English one whose start date has come. */
  async currentPolicy(): Promise<RecordingPolicy | null> {
    const { rows } = await this.db.query(
      `SELECT id, version, language, body FROM consent_policies
        WHERE kind = 'recording' AND language = 'en' AND effective_from <= CURRENT_DATE
        ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    );
    const r = rows[0];
    return r
      ? {
          id: String(r.id),
          version: String(r.version),
          language: String(r.language),
          body: String(r.body),
        }
      : null;
  }

  /** Records agreement for this consultation. A repeat while one is live does nothing. */
  async grantConsent(input: {
    id: string;
    userId: string;
    patientId: string | null;
    policyId: string;
    consultationId: string;
    givenByUserId: string | null;
    ip: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO user_consents (id, user_id, patient_id, policy_id, consultation_id, given_by_user_id, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet) ON CONFLICT DO NOTHING`,
      [
        input.id,
        input.userId,
        input.patientId,
        input.policyId,
        input.consultationId,
        input.givenByUserId,
        input.ip,
      ],
    );
  }

  /**
   * The live recording consents for this consultation, of the text in force only: one id per
   * person who agreed. An agreement to an older version does not count.
   */
  async liveConsents(
    consultationId: string,
    policyId: string,
  ): Promise<{ id: string; userId: string }[]> {
    const { rows } = await this.db.query(
      `SELECT id, user_id FROM user_consents
        WHERE consultation_id = $1 AND policy_id = $2 AND granted AND withdrawn_at IS NULL`,
      [consultationId, policyId],
    );
    return rows.map((r) => ({ id: String(r.id), userId: String(r.user_id) }));
  }

  /** Takes this person's recording agreement for this consultation back. */
  async withdrawConsent(consultationId: string, userId: string): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE user_consents SET withdrawn_at = now()
        WHERE consultation_id = $1 AND user_id = $2 AND granted AND withdrawn_at IS NULL
          AND policy_id IN (SELECT id FROM consent_policies WHERE kind = 'recording')
        RETURNING id`,
      [consultationId, userId],
    );
    return rows.length;
  }

  async activeFor(consultationId: string): Promise<RecordingRow | null> {
    const { rows } = await this.db.query(
      `SELECT r.id, r.consultation_id, r.status, r.provider_recording_ref, r.object_key, r.file_id,
              a.patient_id, d.user_id AS doctor_user_id
         FROM consultation_recordings r
         JOIN consultations c ON c.id = r.consultation_id
         JOIN appointments a ON a.id = c.appointment_id
         JOIN doctors d ON d.id = a.doctor_id
        WHERE r.consultation_id = $1 AND r.status = 'recording'`,
      [consultationId],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async find(id: string): Promise<RecordingRow | null> {
    const { rows } = await this.db.query(
      `SELECT r.id, r.consultation_id, r.status, r.provider_recording_ref, r.object_key, r.file_id,
              a.patient_id, d.user_id AS doctor_user_id
         FROM consultation_recordings r
         JOIN consultations c ON c.id = r.consultation_id
         JOIN appointments a ON a.id = c.appointment_id
         JOIN doctors d ON d.id = a.doctor_id
        WHERE r.id = $1`,
      [id],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  /**
   * Starts a recording row. The database refuses it unless both consents are live recording
   * consents for this consultation (trigger), and refuses a second active one (unique index).
   */
  async insert(input: {
    id: string;
    consultationId: string;
    patientConsentId: string;
    doctorConsentId: string;
    objectKey: string;
    retentionDays: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO consultation_recordings
         (id, consultation_id, patient_consent_id, doctor_consent_id, object_key, retention_until)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + $6::int)`,
      [
        input.id,
        input.consultationId,
        input.patientConsentId,
        input.doctorConsentId,
        input.objectKey,
        input.retentionDays,
      ],
    );
  }

  /** Remembers the provider's reference. False if the recording was stopped meanwhile. */
  async setProviderRef(id: string, ref: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE consultation_recordings SET provider_recording_ref = $2
        WHERE id = $1 AND status = 'recording' RETURNING id`,
      [id, ref],
    );
    return rows.length === 1;
  }

  /** The call stopped being recorded: the file still has to be checked and registered. */
  async markStopped(id: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE consultation_recordings SET status = 'stopped', stopped_at = now()
        WHERE id = $1 AND status = 'recording' RETURNING id`,
      [id],
    );
    return rows.length === 1;
  }

  async markFailed(id: string): Promise<void> {
    await this.db.query(
      `UPDATE consultation_recordings SET status = 'failed'
        WHERE id = $1 AND status IN ('recording', 'stopped')`,
      [id],
    );
  }

  /** The file arrived and passed its checks: register it and finish, together. */
  async registerStored(input: {
    recordingId: string;
    fileId: string;
    ownerUserId: string;
    patientId: string;
    storageKey: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<boolean> {
    return this.tx.transaction(async (q) => {
      const moved = await q.query(
        "SELECT 1 FROM consultation_recordings WHERE id = $1 AND status = 'stopped' FOR UPDATE",
        [input.recordingId],
      );
      if (moved.rows.length === 0) return false;
      // Provider-written, so never offered for download until a scan policy for it is decided
      // (the virus scanner's size limit is far below a recording): the scan state stays pending.
      await q.query(
        `INSERT INTO files (id, owner_user_id, patient_id, purpose, storage_key, original_name, mime_type, size_bytes, sha256)
         VALUES ($1, $2, $3, 'recording', $4, 'consultation-recording.mp4', 'video/mp4', $5, $6)`,
        [
          input.fileId,
          input.ownerUserId,
          input.patientId,
          input.storageKey,
          input.sizeBytes,
          input.sha256,
        ],
      );
      await q.query(
        "UPDATE consultation_recordings SET status = 'stored', file_id = $2 WHERE id = $1",
        [input.recordingId, input.fileId],
      );
      return true;
    });
  }

  /** Stopped recordings whose file has not been registered after a while (a lost job). */
  async staleStopped(olderThanMinutes: number, limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT id FROM consultation_recordings
        WHERE status = 'stopped' AND deleted_at IS NULL
          AND stopped_at < now() - ($1::int * interval '1 minute')
        ORDER BY stopped_at LIMIT $2`,
      [olderThanMinutes, limit],
    );
    return rows.map((r) => String(r.id));
  }

  /** A stopped recording whose file never arrived within a day is given up on. */
  async failAbandoned(olderThanHours: number): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE consultation_recordings SET status = 'failed'
        WHERE status = 'stopped' AND deleted_at IS NULL
          AND stopped_at < now() - ($1::int * interval '1 hour')
        RETURNING id`,
      [olderThanHours],
    );
    return rows.length;
  }

  /** Recordings still "recording" long after any call could last: the stop was lost. */
  async failRunaway(olderThanHours: number): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE consultation_recordings SET status = 'failed'
        WHERE status = 'recording' AND deleted_at IS NULL
          AND created_at < now() - ($1::int * interval '1 hour')
        RETURNING id`,
      [olderThanHours],
    );
    return rows.length;
  }

  /** Recordings past their retention date that still hold data. */
  async expired(
    limit: number,
  ): Promise<{ id: string; objectKey: string | null; fileId: string | null }[]> {
    const { rows } = await this.db.query(
      `SELECT id, object_key, file_id FROM consultation_recordings
        WHERE retention_until < CURRENT_DATE AND deleted_at IS NULL AND status <> 'recording'
        ORDER BY retention_until LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      objectKey: r.object_key === null ? null : String(r.object_key),
      fileId: r.file_id === null ? null : String(r.file_id),
    }));
  }

  /** The object is gone: the recording and its file row are marked deleted, together. */
  async markDeleted(id: string, fileId: string | null): Promise<void> {
    await this.tx.transaction(async (q) => {
      if (fileId)
        await q.query("UPDATE files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [
          fileId,
        ]);
      await q.query(
        "UPDATE consultation_recordings SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
        [id],
      );
    });
  }
}
