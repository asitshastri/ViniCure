import type { Queryable } from "../db/queryable";
import type { AuditStore, StoredAudit, StoredPhiAccess } from "./audit";

// Postgres store for the two append-only logs. INSERT only; the app database role
// cannot update or delete these tables either (db/migrations/0002_audit.sql).
export class PgAuditStore implements AuditStore {
  constructor(private readonly db: Queryable) {}

  async append(entry: StoredAudit): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip, user_agent, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        entry.actorUserId,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.ip ?? null,
        entry.userAgent ?? null,
        JSON.stringify(entry.metadata ?? {}),
        entry.occurredAt,
      ],
    );
  }

  async appendPhi(entry: StoredPhiAccess): Promise<void> {
    await this.db.query(
      `INSERT INTO phi_access_logs (actor_user_id, patient_id, resource_type, resource_id, purpose, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.actorUserId,
        entry.patientId,
        entry.resourceType,
        entry.resourceId,
        entry.purpose,
        entry.occurredAt,
      ],
    );
  }
}
