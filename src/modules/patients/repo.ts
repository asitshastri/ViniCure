import type { Queryable } from "../../lib/db/queryable";
import { MAX_PROFILES_PER_ACCOUNT, type CreatePatient, type UpdatePatient } from "./schemas";

// Patient profile queries. Only this file talks to the database for patients.

export type PatientRow = {
  id: string;
  accountUserId: string;
  relation: string;
  fullName: string;
  dob: string;
  gender: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  bloodGroup: string | null;
  isMinor: boolean;
  createdAt: Date;
};

const COLUMNS = `id, account_user_id, relation, full_name, to_char(dob, 'YYYY-MM-DD') AS dob, gender,
  address_line, city, state, pincode, blood_group,
  (dob > (CURRENT_DATE - interval '18 years')) AS is_minor_now, created_at`;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toRow(row: Record<string, unknown>): PatientRow {
  return {
    id: String(row.id),
    accountUserId: String(row.account_user_id),
    relation: String(row.relation),
    fullName: String(row.full_name),
    dob: String(row.dob),
    gender: String(row.gender),
    addressLine: str(row.address_line),
    city: str(row.city),
    state: str(row.state),
    pincode: str(row.pincode),
    bloodGroup: str(row.blood_group),
    isMinor: row.is_minor_now === true,
    createdAt: row.created_at as Date,
  };
}

// Column for each updatable field. The keys come from our own schema, never from the client.
const UPDATE_COLUMNS: Record<keyof UpdatePatient, string> = {
  relation: "relation",
  fullName: "full_name",
  dob: "dob",
  gender: "gender",
  addressLine: "address_line",
  city: "city",
  state: "state",
  pincode: "pincode",
  bloodGroup: "blood_group",
};

export class PatientRepo {
  constructor(private readonly db: Queryable) {}

  async listForAccount(accountUserId: string): Promise<PatientRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM patients
        WHERE account_user_id = $1 AND deleted_at IS NULL ORDER BY created_at, id`,
      [accountUserId],
    );
    return rows.map(toRow);
  }

  /** Any live profile by id, whoever owns it. The caller decides access with the policy. */
  async findById(id: string): Promise<PatientRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM patients WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  /**
   * Inserts a profile unless the account already has the maximum. The count and the insert are
   * one statement. Returns null when the cap is reached. A unique violation (second "self", or
   * the same person twice) is thrown with the index name for the service to explain.
   */
  async create(input: {
    id: string;
    accountUserId: string;
    data: CreatePatient;
  }): Promise<PatientRow | null> {
    const d = input.data;
    const { rows } = await this.db.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, address_line,
                             city, state, pincode, blood_group, is_minor)
       SELECT $1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11,
              ($5::date > (CURRENT_DATE - interval '18 years'))
        WHERE (SELECT count(*) FROM patients WHERE account_user_id = $2 AND deleted_at IS NULL) < $12
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.accountUserId,
        d.relation,
        d.fullName,
        d.dob,
        d.gender,
        d.addressLine ?? null,
        d.city ?? null,
        d.state ?? null,
        d.pincode ?? null,
        d.bloodGroup ?? null,
        MAX_PROFILES_PER_ACCOUNT,
      ],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async update(id: string, accountUserId: string, data: UpdatePatient): Promise<PatientRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, accountUserId];
    let dobParam = 0;
    for (const key of Object.keys(UPDATE_COLUMNS) as (keyof UpdatePatient)[]) {
      if (data[key] === undefined) continue;
      params.push(data[key]);
      sets.push(`${UPDATE_COLUMNS[key]} = $${params.length}`);
      if (key === "dob") dobParam = params.length;
    }
    // Keep the stored flag in step with the new date of birth (SET sees the old column value).
    if (dobParam) {
      sets.push(`is_minor = ($${dobParam}::date > (CURRENT_DATE - interval '18 years'))`);
    }
    const { rows } = await this.db.query(
      `UPDATE patients SET ${sets.join(", ")}
        WHERE id = $1 AND account_user_id = $2 AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async softDelete(id: string, accountUserId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE patients SET deleted_at = now()
        WHERE id = $1 AND account_user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, accountUserId],
    );
    return rows.length === 1;
  }
}
