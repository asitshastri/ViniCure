import type { Role } from "../../lib/api/types";
import type { Queryable } from "../../lib/db/queryable";
import type { AccountState } from "./staff";

export const MAX_INVITATION_ATTEMPTS = 5;
export type InvitableRole = "doctor" | "admin" | "support";
export type OpenInvitation = {
  id: string;
  email: string;
  roleCode: InvitableRole;
  invitedBy: string;
  pendingTotpSecret: string | null;
  pendingBackupCodes: string | null;
};

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

  // ---- Invitations (P2-06) ----

  /** Closes any open invitation for this address so the new one replaces it. */
  async revokeOpenInvitations(email: string): Promise<void> {
    await this.db.query(
      `UPDATE invitations SET revoked_at = now()
        WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [email],
    );
  }

  async emailTaken(email: string): Promise<boolean> {
    const { rows } = await this.db.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    return rows.length > 0;
  }

  async createInvitation(input: {
    id: string;
    email: string;
    roleCode: InvitableRole;
    tokenHash: string;
    invitedBy: string;
    ttlSeconds: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO invitations (id, email, role_code, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
      [input.id, input.email, input.roleCode, input.tokenHash, input.invitedBy, input.ttlSeconds],
    );
  }

  async revokeInvitation(id: string): Promise<void> {
    await this.db.query(
      `UPDATE invitations SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL`,
      [id],
    );
  }

  /** The invitation behind a link, only while it can still be used. */
  async openInvitation(tokenHash: string): Promise<OpenInvitation | null> {
    const { rows } = await this.db.query(
      `SELECT id, email, role_code, invited_by, pending_totp_secret, pending_backup_codes
         FROM invitations
        WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL
          AND expires_at > now() AND failed_attempts < $2`,
      [tokenHash, MAX_INVITATION_ATTEMPTS],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      email: String(row.email),
      roleCode: String(row.role_code) as InvitableRole,
      invitedBy: String(row.invited_by),
      pendingTotpSecret: row.pending_totp_secret === null ? null : String(row.pending_totp_secret),
      pendingBackupCodes:
        row.pending_backup_codes === null ? null : String(row.pending_backup_codes),
    };
  }

  /** Stores the authenticator secret shown at enrolment. False when the link is no longer open. */
  async storePendingEnrolment(input: {
    id: string;
    secret: string;
    backupCodes: string;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE invitations SET pending_totp_secret = $2, pending_backup_codes = $3
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
          AND expires_at > now() AND failed_attempts < $4
       RETURNING id`,
      [input.id, input.secret, input.backupCodes, MAX_INVITATION_ATTEMPTS],
    );
    return rows.length === 1;
  }

  /** Counts a wrong code. At the limit the invitation is burnt, so the admin must send a new one. */
  async recordFailedEnrolment(id: string): Promise<void> {
    await this.db.query(
      `UPDATE invitations
          SET failed_attempts = failed_attempts + 1,
              revoked_at = CASE WHEN failed_attempts + 1 >= $2 THEN now() ELSE revoked_at END
        WHERE id = $1`,
      [id, MAX_INVITATION_ATTEMPTS],
    );
  }

  /**
   * Accepts the invitation and creates the whole account in ONE statement, so either everything
   * exists or nothing does: the user (email verified, two-factor on), the password, the role and
   * the verified authenticator. The invitation is claimed first (accepted_at IS NULL), so two
   * simultaneous requests cannot both create a user. Returns the new user id, or null when the
   * invitation was no longer open.
   */
  async completeInvitation(input: {
    invitationId: string;
    userId: string;
    name: string;
    accountId: string;
    passwordHash: string;
    twoFactorId: string;
    totpSecret: string;
    backupCodes: string;
  }): Promise<string | null> {
    const { rows } = await this.db.query(
      `WITH claimed AS (
         UPDATE invitations SET accepted_at = now(), accepted_user_id = $2,
                pending_totp_secret = NULL, pending_backup_codes = NULL
          WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
            AND expires_at > now() AND failed_attempts < $9
         RETURNING email, role_code, invited_by
       ), new_user AS (
         INSERT INTO users (id, name, email, email_verified, two_factor_enabled)
         SELECT $2::uuid, $3, claimed.email, true, true FROM claimed
         RETURNING id
       ), new_account AS (
         INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password)
         SELECT $4::uuid, new_user.id, new_user.id::text, 'credential', $5 FROM new_user
         RETURNING id
       ), new_role AS (
         INSERT INTO user_roles (user_id, role_id, granted_by)
         SELECT new_user.id, roles.id, claimed.invited_by
           FROM new_user, claimed JOIN roles ON roles.code = claimed.role_code
         RETURNING user_id
       ), new_factor AS (
         INSERT INTO auth_two_factor (id, user_id, secret, backup_codes, verified)
         SELECT $6::uuid, new_user.id, $7, $8, true FROM new_user
         RETURNING id
       )
       SELECT (SELECT id FROM new_user) AS user_id,
              (SELECT count(*) FROM new_account) + (SELECT count(*) FROM new_role)
                + (SELECT count(*) FROM new_factor) AS parts`,
      [
        input.invitationId,
        input.userId,
        input.name,
        input.accountId,
        input.passwordHash,
        input.twoFactorId,
        input.totpSecret,
        input.backupCodes,
        MAX_INVITATION_ATTEMPTS,
      ],
    );
    const row = rows[0];
    return row && row.user_id ? String(row.user_id) : null;
  }
}
