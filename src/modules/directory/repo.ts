import type { Queryable } from "../../lib/db/queryable";
import {
  MAX_KYC_DOCUMENTS,
  MAX_PER_DOC_TYPE,
  type ApplicationBody,
  type PublicDoctorView,
  type PublicSort,
  type SpecialtyView,
} from "./schemas";

// Doctor application and KYC queries. Only this file talks to the database for them.

export type DoctorRow = {
  id: string;
  userId: string | null;
  displayName: string;
  registrationNo: string;
  registrationCouncil: string;
  qualifications: string;
  languages: string[];
  specialtyId: number | null;
  consultationFeePaise: number;
  kycStatus: string;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
  /** created_at with full precision, for the page cursor. */
  cursorTime: string;
};

export type DocumentRow = {
  id: string;
  doctorId: string;
  fileId: string;
  docType: string;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
  scanStatus: string;
  uploaded: boolean;
  fileDeleted: boolean;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const DOCTOR_COLUMNS = `d.id, d.user_id, d.display_name, d.registration_no, d.registration_council,
  d.qualifications, d.languages, d.consultation_fee_paise, d.kyc_status, d.status, d.review_note,
  d.created_at,
  to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
  (SELECT s.specialty_id FROM doctor_specialties s WHERE s.doctor_id = d.id AND s.is_primary) AS specialty_id`;

function toDoctor(row: Record<string, unknown>): DoctorRow {
  return {
    id: String(row.id),
    userId: str(row.user_id),
    displayName: String(row.display_name),
    registrationNo: String(row.registration_no),
    registrationCouncil: String(row.registration_council),
    qualifications: String(row.qualifications),
    languages: (row.languages as string[] | null) ?? [],
    specialtyId:
      row.specialty_id === null || row.specialty_id === undefined ? null : Number(row.specialty_id),
    consultationFeePaise: Number(row.consultation_fee_paise),
    kycStatus: String(row.kyc_status),
    status: String(row.status),
    reviewNote: str(row.review_note),
    createdAt: new Date(String(row.created_at)),
    cursorTime: String(row.cursor_time),
  };
}

const DOCUMENT_COLUMNS = `k.id, k.doctor_id, k.file_id, k.doc_type, k.status, k.review_note, k.created_at,
  f.scan_status, (f.uploaded_at IS NOT NULL) AS uploaded, (f.deleted_at IS NOT NULL) AS file_deleted,
  f.storage_key, f.mime_type, f.size_bytes`;

function toDocument(row: Record<string, unknown>): DocumentRow {
  return {
    id: String(row.id),
    doctorId: String(row.doctor_id),
    fileId: String(row.file_id),
    docType: String(row.doc_type),
    status: String(row.status),
    reviewNote: str(row.review_note),
    createdAt: new Date(String(row.created_at)),
    scanStatus: String(row.scan_status),
    uploaded: row.uploaded === true,
    fileDeleted: row.file_deleted === true,
    storageKey: String(row.storage_key),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
  };
}

export type PublicDoctorRow = PublicDoctorView & { sortKey: string };

// Working hours are stored as India wall-clock times, weekday 0 = Sunday (the same numbering as
// Postgres `dow`). "Today" and "now" below are India time.
const IST_NOW = "(now() AT TIME ZONE 'Asia/Kolkata')";
const AVAILABLE_TODAY_SQL =
  "(EXISTS (SELECT 1 FROM doctor_availability_rules r WHERE r.doctor_id = d.id" +
  " AND r.weekday = extract(dow FROM " +
  IST_NOW +
  ")::int" +
  " AND r.valid_from <= " +
  IST_NOW +
  "::date" +
  " AND (r.valid_to IS NULL OR r.valid_to >= " +
  IST_NOW +
  "::date)" +
  " AND r.end_time > " +
  IST_NOW +
  "::time)" +
  " AND NOT EXISTS (SELECT 1 FROM doctor_time_off t WHERE t.doctor_id = d.id" +
  " AND t.start_at <= date_trunc('day', " +
  IST_NOW +
  ") AT TIME ZONE 'Asia/Kolkata'" +
  " AND t.end_at >= (date_trunc('day', " +
  IST_NOW +
  ") + interval '1 day') AT TIME ZONE 'Asia/Kolkata'))";

const PUBLIC_COLUMNS =
  "d.id, d.display_name, d.registration_no, d.registration_council, d.qualifications, d.languages," +
  " d.consultation_fee_paise, sp.id AS specialty_id, sp.name AS specialty_name," +
  " " +
  AVAILABLE_TODAY_SQL +
  " AS available_today";

const PUBLIC_FROM =
  " FROM doctors d LEFT JOIN doctor_specialties ds ON ds.doctor_id = d.id AND ds.is_primary" +
  " LEFT JOIN specialties sp ON sp.id = ds.specialty_id";

/** Only listed doctors: approved and active. The database also forbids active without approved. */
const LISTED = "d.status = 'active' AND d.kyc_status = 'approved'";

/** The sort orders, as fixed text. A visitor picks a key; nothing they send reaches the SQL. */
const SORTS: Record<PublicSort, { key: string; type: string; order: string; after: string }> = {
  name: {
    key: "lower(d.display_name)",
    type: "text",
    order: "lower(d.display_name), d.id",
    after: ">",
  },
  fee_asc: {
    key: "d.consultation_fee_paise",
    type: "integer",
    order: "d.consultation_fee_paise, d.id",
    after: ">",
  },
  fee_desc: {
    key: "d.consultation_fee_paise",
    type: "integer",
    order: "d.consultation_fee_paise DESC, d.id DESC",
    after: "<",
  },
};

function toPublic(row: Record<string, unknown>): PublicDoctorRow {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    registrationNo: String(row.registration_no),
    registrationCouncil: String(row.registration_council),
    qualifications: String(row.qualifications),
    languages: (row.languages as string[] | null) ?? [],
    specialty:
      row.specialty_id === null || row.specialty_id === undefined
        ? null
        : { id: Number(row.specialty_id), name: String(row.specialty_name) },
    consultationFeePaise: Number(row.consultation_fee_paise),
    availableToday: row.available_today === true,
    sortKey: String(row.sort_key ?? ""),
  };
}

export type DoctorDecisionPatch = {
  from: { kycStatus: string; status: string };
  to: { kycStatus: string; status: string };
  note: string | null;
};

export class DirectoryRepo {
  constructor(private readonly db: Queryable) {}

  async findDoctorByUser(userId: string): Promise<DoctorRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${DOCTOR_COLUMNS} FROM doctors d WHERE d.user_id = $1`,
      [userId],
    );
    return rows[0] ? toDoctor(rows[0]) : null;
  }

  async findDoctor(id: string): Promise<DoctorRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${DOCTOR_COLUMNS} FROM doctors d WHERE d.id = $1`,
      [id],
    );
    return rows[0] ? toDoctor(rows[0]) : null;
  }

  /**
   * Creates or changes the signed-in doctor's application in one statement. A rejected
   * application goes back to pending when it is changed. An approved one cannot be changed here
   * (returns null). The primary specialty is moved or added in the same statement.
   */
  async saveApplication(input: {
    id: string;
    userId: string;
    data: ApplicationBody;
  }): Promise<DoctorRow | null> {
    const d = input.data;
    const { rows } = await this.db.query(
      `WITH saved AS (
         INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council,
                              qualifications, languages, consultation_fee_paise)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET
           display_name = EXCLUDED.display_name,
           registration_no = EXCLUDED.registration_no,
           registration_council = EXCLUDED.registration_council,
           qualifications = EXCLUDED.qualifications,
           languages = EXCLUDED.languages,
           consultation_fee_paise = EXCLUDED.consultation_fee_paise,
           kyc_status = 'pending',
           review_note = NULL
         WHERE doctors.kyc_status <> 'approved'
         RETURNING id
       ), moved AS (
         UPDATE doctor_specialties SET specialty_id = $9
          WHERE doctor_id IN (SELECT id FROM saved) AND is_primary
          RETURNING doctor_id
       ), tagged AS (
         INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary)
         SELECT id, $9, true FROM saved
          WHERE NOT EXISTS (SELECT 1 FROM doctor_specialties s WHERE s.doctor_id = saved.id AND s.is_primary)
         RETURNING doctor_id
       )
       SELECT id FROM saved`,
      [
        input.id,
        input.userId,
        d.displayName,
        d.registrationNo,
        d.registrationCouncil,
        d.qualifications,
        d.languages,
        d.consultationFeePaise,
        d.specialtyId,
      ],
    );
    if (!rows[0]) return null;
    // Read the row back: a select in the same statement would not see the insert.
    return this.findDoctorByUser(input.userId);
  }

  async documentsOf(doctorId: string): Promise<DocumentRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${DOCUMENT_COLUMNS} FROM doctor_kyc_documents k JOIN files f ON f.id = k.file_id
        WHERE k.doctor_id = $1 ORDER BY k.created_at, k.id`,
      [doctorId],
    );
    return rows.map(toDocument);
  }

  async findDocument(id: string): Promise<DocumentRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${DOCUMENT_COLUMNS} FROM doctor_kyc_documents k JOIN files f ON f.id = k.file_id
        WHERE k.id = $1`,
      [id],
    );
    return rows[0] ? toDocument(rows[0]) : null;
  }

  /**
   * Registers a file and its KYC document in one statement, unless the doctor already holds the
   * maximum (overall, or of this type). Returns null at the limit.
   */
  async createDocument(input: {
    documentId: string;
    fileId: string;
    doctorId: string;
    ownerUserId: string;
    docType: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    fileName: string;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `WITH f AS (
         INSERT INTO files (id, owner_user_id, purpose, storage_key, original_name, mime_type, size_bytes)
         SELECT $1, $2, 'kyc', $3, $4, $5, $6
          WHERE (SELECT count(*) FROM doctor_kyc_documents k JOIN files x ON x.id = k.file_id
                  WHERE k.doctor_id = $7 AND x.deleted_at IS NULL) < $9
            AND (SELECT count(*) FROM doctor_kyc_documents k JOIN files x ON x.id = k.file_id
                  WHERE k.doctor_id = $7 AND k.doc_type = $8 AND x.deleted_at IS NULL) < $10
         RETURNING id
       )
       INSERT INTO doctor_kyc_documents (id, doctor_id, file_id, doc_type)
       SELECT $11, $7, id, $8 FROM f RETURNING id`,
      [
        input.fileId,
        input.ownerUserId,
        input.storageKey,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.doctorId,
        input.docType,
        MAX_KYC_DOCUMENTS,
        MAX_PER_DOC_TYPE,
        input.documentId,
      ],
    );
    return rows.length === 1;
  }

  /** True once; a second call (a replay) changes nothing and returns false. */
  async markUploaded(fileId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE files SET uploaded_at = now()
        WHERE id = $1 AND uploaded_at IS NULL AND deleted_at IS NULL RETURNING id`,
      [fileId],
    );
    return rows.length === 1;
  }

  async removeFile(fileId: string): Promise<void> {
    await this.db.query(
      `UPDATE files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [fileId],
    );
  }

  async fileForScan(fileId: string): Promise<{ storageKey: string; scanStatus: string } | null> {
    const { rows } = await this.db.query(
      `SELECT storage_key, scan_status FROM files
        WHERE id = $1 AND uploaded_at IS NOT NULL AND deleted_at IS NULL`,
      [fileId],
    );
    return rows[0]
      ? { storageKey: String(rows[0].storage_key), scanStatus: String(rows[0].scan_status) }
      : null;
  }

  /** Records a verdict. An infected file is also soft-deleted so it is never offered again. */
  async setScanResult(fileId: string, status: "clean" | "infected" | "error"): Promise<void> {
    await this.db.query(
      `UPDATE files SET scan_status = $2, scanned_at = now(),
              deleted_at = CASE WHEN $2 = 'infected' THEN now() ELSE deleted_at END
        WHERE id = $1 AND uploaded_at IS NOT NULL`,
      [fileId, status],
    );
  }

  /** Only a clean, uploaded, still-pending document can be reviewed. */
  async reviewDocument(input: {
    id: string;
    reviewerId: string;
    decision: "approved" | "rejected";
    note: string | null;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE doctor_kyc_documents k
          SET status = $3, reviewed_by = $2, reviewed_at = now(), review_note = $4
         FROM files f
        WHERE k.id = $1 AND k.file_id = f.id AND k.status = 'pending'
          AND f.scan_status = 'clean' AND f.deleted_at IS NULL
        RETURNING k.id`,
      [input.id, input.reviewerId, input.decision, input.note],
    );
    return rows.length === 1;
  }

  /** Types of document that are accepted and still stored. */
  async approvedDocTypes(doctorId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT DISTINCT k.doc_type FROM doctor_kyc_documents k JOIN files f ON f.id = k.file_id
        WHERE k.doctor_id = $1 AND k.status = 'approved' AND f.deleted_at IS NULL`,
      [doctorId],
    );
    return rows.map((r) => String(r.doc_type));
  }

  /** Moves a doctor to a new state only if they are still in the state the decision was made on. */
  async applyDecision(id: string, patch: DoctorDecisionPatch): Promise<DoctorRow | null> {
    const { rows } = await this.db.query(
      `UPDATE doctors SET kyc_status = $4, status = $5, review_note = $6
        WHERE id = $1 AND kyc_status = $2 AND status = $3 RETURNING id`,
      [
        id,
        patch.from.kycStatus,
        patch.from.status,
        patch.to.kycStatus,
        patch.to.status,
        patch.note,
      ],
    );
    return rows[0] ? this.findDoctor(id) : null;
  }

  /** One page of applications, oldest first, after a (created_at, id) cursor. */
  async listDoctors(input: {
    status?: string;
    kycStatus?: string;
    after?: { createdAt: string; id: string };
    limit: number;
  }): Promise<DoctorRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.status) {
      params.push(input.status);
      where.push(`d.status = $${params.length}`);
    }
    if (input.kycStatus) {
      params.push(input.kycStatus);
      where.push(`d.kyc_status = $${params.length}`);
    }
    if (input.after) {
      params.push(input.after.createdAt, input.after.id);
      where.push(
        `(d.created_at, d.id) > ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    params.push(input.limit);
    const { rows } = await this.db.query(
      `SELECT ${DOCTOR_COLUMNS} FROM doctors d
        ${whereSql}
        ORDER BY d.created_at, d.id LIMIT $${params.length}`,
      params,
    );
    return rows.map(toDoctor);
  }

  // ---- public directory (P4-03) ----

  async listSpecialties(): Promise<SpecialtyView[]> {
    const { rows } = await this.db.query(
      "SELECT s.id, s.name, count(d.id)::int AS doctor_count FROM specialties s" +
        " LEFT JOIN doctor_specialties ds ON ds.specialty_id = s.id AND ds.is_primary" +
        " LEFT JOIN doctors d ON d.id = ds.doctor_id AND " +
        LISTED +
        " GROUP BY s.id, s.name ORDER BY s.name",
    );
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      doctorCount: Number(r.doctor_count),
    }));
  }

  async findPublic(id: string): Promise<PublicDoctorRow | null> {
    const { rows } = await this.db.query(
      "SELECT " + PUBLIC_COLUMNS + PUBLIC_FROM + " WHERE d.id = $1 AND " + LISTED,
      [id],
    );
    return rows[0] ? toPublic(rows[0]) : null;
  }

  /** One page of listed doctors. Every filter is a bound value; the sort comes from SORTS. */
  async searchPublic(input: {
    q?: string;
    specialtyId?: number;
    language?: string;
    feeMin?: number;
    feeMax?: number;
    availableToday?: boolean;
    sort: PublicSort;
    after?: { key: string; id: string };
    limit: number;
  }): Promise<PublicDoctorRow[]> {
    const sort = SORTS[input.sort];
    const where: string[] = [LISTED];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return "$" + String(params.length);
    };
    // Not LIKE: the text is compared as a plain substring, so % and _ mean nothing.
    if (input.q) where.push("strpos(lower(d.display_name), lower(" + bind(input.q) + ")) > 0");
    if (input.specialtyId !== undefined) where.push("sp.id = " + bind(input.specialtyId));
    if (input.language) where.push("d.languages @> ARRAY[" + bind(input.language) + "]::text[]");
    if (input.feeMin !== undefined) where.push("d.consultation_fee_paise >= " + bind(input.feeMin));
    if (input.feeMax !== undefined) where.push("d.consultation_fee_paise <= " + bind(input.feeMax));
    if (input.availableToday) where.push(AVAILABLE_TODAY_SQL);
    if (input.after) {
      const k = bind(input.after.key);
      const i = bind(input.after.id);
      where.push(
        "(" +
          sort.key +
          ", d.id) " +
          sort.after +
          " (" +
          k +
          "::" +
          sort.type +
          ", " +
          i +
          "::uuid)",
      );
    }
    const limit = bind(input.limit);
    const { rows } = await this.db.query(
      "SELECT " +
        PUBLIC_COLUMNS +
        ", (" +
        sort.key +
        ")::text AS sort_key" +
        PUBLIC_FROM +
        " WHERE " +
        where.join(" AND ") +
        " ORDER BY " +
        sort.order +
        " LIMIT " +
        limit,
      params,
    );
    return rows.map(toPublic);
  }
}
