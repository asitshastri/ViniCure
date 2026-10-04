import type { Queryable } from "../../lib/db/queryable";

// Consent queries (P6-05). Only this file talks to the database for consent.

export type PolicyRow = {
  id: string;
  kind: string;
  version: string;
  language: string;
  body: string;
};

export type ConsentSubject = {
  appointmentId: string;
  patientId: string;
  /** The account that owns the patient profile (the person who books, a parent for a child). */
  accountUserId: string;
  /** Someone other than the account holder is the patient (a child or relative). */
  onBehalf: boolean;
};

function toPolicy(r: Record<string, unknown>): PolicyRow {
  return {
    id: String(r.id),
    kind: String(r.kind),
    version: String(r.version),
    language: String(r.language),
    body: String(r.body),
  };
}

export class ConsentRepo {
  constructor(private readonly db: Queryable) {}

  /** The patient an appointment is for, and the account that owns the profile. */
  async subjectOfAppointment(appointmentId: string): Promise<ConsentSubject | null> {
    const { rows } = await this.db.query(
      `SELECT a.id, a.patient_id, p.account_user_id, (p.relation <> 'self' OR p.is_minor) AS on_behalf
         FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`,
      [appointmentId],
    );
    const r = rows[0];
    return r
      ? {
          appointmentId: String(r.id),
          patientId: String(r.patient_id),
          accountUserId: String(r.account_user_id),
          onBehalf: r.on_behalf === true,
        }
      : null;
  }

  /**
   * The text in force for each kind: the newest English version whose start date has come. A later
   * version (not yet in force) and other languages are not asked for.
   */
  async currentPolicies(kinds: readonly string[]): Promise<PolicyRow[]> {
    const { rows } = await this.db.query(
      `SELECT DISTINCT ON (kind) id, kind, version, language, body
         FROM consent_policies
        WHERE kind = ANY($1::text[]) AND language = 'en' AND effective_from <= CURRENT_DATE
        ORDER BY kind, effective_from DESC, created_at DESC`,
      [kinds],
    );
    return rows.map(toPolicy);
  }

  /**
   * The (kind, version) pairs this patient has agreed to and not withdrawn. A consent given to the
   * Hindi or Gujarati text of a version counts for that version.
   */
  async liveConsents(
    userId: string,
    patientId: string,
    kinds: readonly string[],
  ): Promise<{ kind: string; version: string }[]> {
    const { rows } = await this.db.query(
      `SELECT DISTINCT pc.kind, pc.version
         FROM user_consents uc JOIN consent_policies pc ON pc.id = uc.policy_id
        WHERE uc.user_id = $1 AND uc.patient_id = $2 AND uc.granted AND uc.withdrawn_at IS NULL
          AND pc.kind = ANY($3::text[])`,
      [userId, patientId, kinds],
    );
    return rows.map((r) => ({ kind: String(r.kind), version: String(r.version) }));
  }

  async findPolicy(id: string): Promise<PolicyRow | null> {
    const { rows } = await this.db.query(
      "SELECT id, kind, version, language, body FROM consent_policies WHERE id = $1",
      [id],
    );
    return rows[0] ? toPolicy(rows[0]) : null;
  }

  /** Records agreement. A repeat while one is live does nothing. */
  async grant(input: {
    id: string;
    userId: string;
    patientId: string;
    policyId: string;
    givenByUserId: string | null;
    ip: string | null;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO user_consents (id, user_id, patient_id, policy_id, given_by_user_id, ip)
       VALUES ($1, $2, $3, $4, $5, $6::inet) ON CONFLICT DO NOTHING RETURNING id`,
      [input.id, input.userId, input.patientId, input.policyId, input.givenByUserId, input.ip],
    );
    return rows.length === 1;
  }

  /** The consents of this account that can be withdrawn, with who they belong to. */
  async findConsent(
    id: string,
  ): Promise<{ id: string; userId: string; withdrawn: boolean } | null> {
    const { rows } = await this.db.query(
      "SELECT id, user_id, withdrawn_at IS NOT NULL AS withdrawn FROM user_consents WHERE id = $1",
      [id],
    );
    return rows[0]
      ? {
          id: String(rows[0].id),
          userId: String(rows[0].user_id),
          withdrawn: rows[0].withdrawn === true,
        }
      : null;
  }

  async withdraw(id: string, userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "UPDATE user_consents SET withdrawn_at = now() WHERE id = $1 AND user_id = $2 AND withdrawn_at IS NULL RETURNING id",
      [id, userId],
    );
    return rows.length === 1;
  }
}
