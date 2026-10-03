import type { Queryable } from "../db/queryable";
import type { DurableStore, StoredRecord } from "./idempotency";

// Postgres store for idempotency records (db/migrations/0003_idempotency.sql).
export class PgDurableStore implements DurableStore {
  constructor(private readonly db: Queryable) {}

  /** Creates the row, or takes over an expired one. False when a live row exists. */
  async insertIfAbsent(record: StoredRecord): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO idempotency_keys (scope_hash, request_hash, state, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scope_hash) DO UPDATE
         SET request_hash = EXCLUDED.request_hash, state = EXCLUDED.state, expires_at = EXCLUDED.expires_at,
             response_status = NULL, response_content_type = NULL, response_body_enc = NULL, created_at = now()
         WHERE idempotency_keys.expires_at <= now()
       RETURNING scope_hash`,
      [record.scopeHash, record.requestHash, record.state, record.expiresAt],
    );
    return rows.length === 1;
  }

  async get(scopeHash: string): Promise<StoredRecord | null> {
    const { rows } = await this.db.query(
      `SELECT scope_hash, request_hash, state, response_status, response_content_type, response_body_enc, expires_at
       FROM idempotency_keys WHERE scope_hash = $1 AND expires_at > now()`,
      [scopeHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      scopeHash: String(row.scope_hash),
      requestHash: String(row.request_hash),
      state: row.state as StoredRecord["state"],
      responseStatus: row.response_status === null ? undefined : Number(row.response_status),
      responseContentType: (row.response_content_type as string | null) ?? undefined,
      responseBodyEnc: (row.response_body_enc as string | null) ?? null,
      expiresAt: new Date(String(row.expires_at)),
    };
  }

  async complete(
    scopeHash: string,
    result: { responseStatus: number; responseContentType: string; responseBodyEnc: string | null },
  ): Promise<void> {
    await this.db.query(
      `UPDATE idempotency_keys
       SET state = 'completed', response_status = $2, response_content_type = $3, response_body_enc = $4,
           expires_at = now() + interval '24 hours'
       WHERE scope_hash = $1`,
      [scopeHash, result.responseStatus, result.responseContentType, result.responseBodyEnc],
    );
  }

  async remove(scopeHash: string): Promise<void> {
    await this.db.query("DELETE FROM idempotency_keys WHERE scope_hash = $1", [scopeHash]);
  }

  /** For the hourly cleanup job. */
  async deleteExpired(): Promise<number> {
    const { rows } = await this.db.query(
      "WITH gone AS (DELETE FROM idempotency_keys WHERE expires_at <= now() RETURNING 1) SELECT count(*)::int AS n FROM gone",
    );
    return Number(rows[0]?.n ?? 0);
  }
}
