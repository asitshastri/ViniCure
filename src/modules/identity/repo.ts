import type { Role } from "../../lib/api/types";
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
}
