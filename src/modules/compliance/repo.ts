import type { Queryable } from "../../lib/db/queryable";

// Data request queries (P2-11). Only this file talks to the database for them.

export const REQUEST_TYPES = ["export", "erase"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export type DataRequestRow = {
  id: string;
  type: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
};

const COLUMNS = "id, type, status, created_at, completed_at";

const toRow = (row: Record<string, unknown>): DataRequestRow => ({
  id: String(row.id),
  type: String(row.type),
  status: String(row.status),
  createdAt: row.created_at as Date,
  completedAt: (row.completed_at as Date | null) ?? null,
});

export class DataRequestRepo {
  constructor(private readonly db: Queryable) {}

  /** Creates a pending request. Null when the person already has an open one of this type. */
  async createIfNoneOpen(input: {
    id: string;
    userId: string;
    type: RequestType;
  }): Promise<DataRequestRow | null> {
    const { rows } = await this.db.query(
      `INSERT INTO data_requests (id, user_id, type) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, type) WHERE status IN ('pending', 'in_progress') DO NOTHING
       RETURNING ${COLUMNS}`,
      [input.id, input.userId, input.type],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async listForUser(userId: string): Promise<DataRequestRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${COLUMNS} FROM data_requests WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 50`,
      [userId],
    );
    return rows.map(toRow);
  }
}
