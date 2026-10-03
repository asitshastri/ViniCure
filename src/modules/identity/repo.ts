import type { Role } from "../../lib/api/types";
import type { AccountState } from "./staff";
import type { Queryable } from "../../lib/db/queryable";

// Identity queries. Only this file (and other repo.ts files) talk to the database.
export class IdentityRepo {
  constructor(private readonly db: Queryable) {}

  /** The role codes granted to a user. Empty for a user with none. */
  async rolesOf(userId: string): Promise<Role[]> {
    const { rows } = await this.db.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [userId],
    );
    return rows.map((row) => String(row.code) as Role);
  }

  /** What decides whether a session may be created. Null for an unknown user. */
  async accountState(userId: string): Promise<AccountState | null> {
    const { rows } = await this.db.query(
      `SELECT two_factor_enabled, status FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      roles: await this.rolesOf(userId),
      twoFactorEnabled: row.two_factor_enabled === true,
      status: row.status as AccountState["status"],
    };
  }

  /**
   * A phone code was just proven: record when, and give a user who has no role yet the patient
   * role. Staff always hold a role, so this never adds the patient role to them.
   */
  async recordPhoneVerified(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET phone_verified_at = now(), last_active_at = now() WHERE id = $1`,
      [userId],
    );
    await this.db.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1::uuid, r.id FROM roles r
        WHERE r.code = 'patient'
          AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1::uuid)
       ON CONFLICT DO NOTHING`,
      [userId],
    );
  }
}
