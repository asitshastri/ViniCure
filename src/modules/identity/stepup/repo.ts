import type { Queryable } from "../../../lib/db/queryable";
import { PHONE_STALE_DAYS, TRUSTED_DEVICE_DAYS } from "./risk";

// Step-up queries (P2-18). Only this file talks to the database for them. Tokens and codes are
// compared by hash here; the callers never pass a stored secret around.

export type AccountSnapshot = {
  lastActiveAt: Date | null;
  phoneVerifiedAt: Date | null;
  phoneChangedAt: Date | null;
  forceStepUpAt: Date | null;
  phoneNumber: string | null;
  email: string;
  emailVerified: boolean;
};

export type DeviceRow = {
  id: string;
  label: string | null;
  unlockedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

const date = (v: unknown): Date | null => (v === null || v === undefined ? null : (v as Date));

export class StepUpRepo {
  constructor(private readonly db: Queryable) {}

  async snapshot(userId: string): Promise<AccountSnapshot | null> {
    const { rows } = await this.db.query(
      `SELECT last_active_at, phone_verified_at, phone_changed_at, force_step_up_at,
              phone_number, email, email_verified
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      lastActiveAt: date(r.last_active_at),
      phoneVerifiedAt: date(r.phone_verified_at),
      phoneChangedAt: date(r.phone_changed_at),
      forceStepUpAt: date(r.force_step_up_at),
      phoneNumber: r.phone_number === null ? null : String(r.phone_number),
      email: String(r.email),
      emailVerified: r.email_verified === true,
    };
  }

  /** A phone sign-in just succeeded: remember when, and that the number was proven now. */
  async stampPhoneSignIn(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET last_active_at = now(), phone_verified_at = now(), phone_number_verified = true
        WHERE id = $1`,
      [userId],
    );
  }

  async stampActivity(userId: string): Promise<void> {
    await this.db.query(`UPDATE users SET last_active_at = now() WHERE id = $1`, [userId]);
  }

  // ---- Trusted devices ----

  /** The live trusted device with this cookie hash, for this person only. */
  async findDevice(userId: string, deviceHash: string): Promise<{ id: string } | null> {
    const { rows } = await this.db.query(
      `SELECT id FROM trusted_devices
        WHERE user_id = $1 AND device_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [userId, deviceHash],
    );
    return rows[0] ? { id: String(rows[0].id) } : null;
  }

  /** Remembers a device for 30 days. The same cookie on the same person only renews it. */
  async trustDevice(input: {
    id: string;
    userId: string;
    deviceHash: string;
    label: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO trusted_devices (id, user_id, device_hash, label, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
       ON CONFLICT (device_hash) DO UPDATE
          SET expires_at = EXCLUDED.expires_at, last_seen_at = now(), revoked_at = NULL,
              unlocked_at = now(), label = EXCLUDED.label
        WHERE trusted_devices.user_id = EXCLUDED.user_id`,
      [input.id, input.userId, input.deviceHash, input.label.slice(0, 80), TRUSTED_DEVICE_DAYS],
    );
  }

  /** Each calm sign-in on a known device pushes its expiry out another 30 days. */
  async touchDevice(id: string): Promise<void> {
    await this.db.query(
      `UPDATE trusted_devices SET last_seen_at = now(), expires_at = now() + make_interval(days => $2)
        WHERE id = $1 AND revoked_at IS NULL`,
      [id, TRUSTED_DEVICE_DAYS],
    );
  }

  async listDevices(userId: string): Promise<DeviceRow[]> {
    const { rows } = await this.db.query(
      `SELECT id, label, unlocked_at, last_seen_at, expires_at FROM trusted_devices
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_seen_at DESC, id LIMIT 20`,
      [userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      label: r.label === null ? null : String(r.label),
      unlockedAt: r.unlocked_at as Date,
      lastSeenAt: r.last_seen_at as Date,
      expiresAt: r.expires_at as Date,
    }));
  }

  async revokeDevice(userId: string, id: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE trusted_devices SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
      [id, userId],
    );
    return rows.length === 1;
  }

  async revokeAllDevices(userId: string, exceptDeviceHash?: string): Promise<void> {
    await this.db.query(
      `UPDATE trusted_devices SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR device_hash <> $2)`,
      [userId, exceptDeviceHash ?? null],
    );
  }

  // ---- Recovery codes (stored as hashes, single use) ----

  /** Replaces the person's unused codes with a new set. Used codes stay as history. */
  async replaceRecoveryCodes(userId: string, codes: { id: string; hash: string }[]): Promise<void> {
    await this.db.query(`DELETE FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, [
      userId,
    ]);
    for (const code of codes) {
      await this.db.query(
        `INSERT INTO recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)`,
        [code.id, userId, code.hash],
      );
    }
  }

  /** Spends a code. True for exactly one caller, even when two try at once. */
  async spendRecoveryCode(userId: string, hash: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE recovery_codes SET used_at = now()
        WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`,
      [userId, hash],
    );
    return rows.length === 1;
  }

  async unusedRecoveryCodes(userId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  // ---- Sessions ----

  async unlockSession(userId: string, sessionId: string, method: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE auth_sessions SET limited = false, unlock_method = $3
        WHERE id = $1 AND user_id = $2 RETURNING id`,
      [sessionId, userId, method],
    );
    return rows.length === 1;
  }

  async clearForceStepUp(userId: string): Promise<void> {
    await this.db.query(`UPDATE users SET force_step_up_at = NULL WHERE id = $1`, [userId]);
  }

  /** "This was not me": every session ends, every device is forgotten, step-up is forced. */
  async flagNotMe(userId: string): Promise<void> {
    await this.db.query(`UPDATE users SET force_step_up_at = now() WHERE id = $1`, [userId]);
    await this.db.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [userId]);
    await this.db.query(
      `UPDATE trusted_devices SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  // ---- Alerts ("not me" links) ----

  async createAlert(input: {
    id: string;
    userId: string;
    sessionId: string | null;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO signin_alerts (id, user_id, session_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
      [input.id, input.userId, input.sessionId, input.tokenHash, input.ttlSeconds],
    );
  }

  /** Uses a "not me" link once. Returns the person it belongs to, or null. */
  async consumeAlert(tokenHash: string): Promise<string | null> {
    const { rows } = await this.db.query(
      `UPDATE signin_alerts SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [tokenHash],
    );
    return rows[0] ? String(rows[0].user_id) : null;
  }

  // ---- Number change and re-verification ----

  /** After a number change was proven: note it, end the other sessions, forget other devices. */
  async afterNumberChange(
    userId: string,
    keepSessionId: string | null,
    keepDeviceHash?: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE users SET phone_changed_at = now(), phone_verified_at = now(), phone_number_verified = true
        WHERE id = $1`,
      [userId],
    );
    await this.db.query(
      `DELETE FROM auth_sessions WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)`,
      [userId, keepSessionId],
    );
    await this.revokeAllDevices(userId, keepDeviceHash);
  }

  /** Numbers not proven for 180 days stop being used for notices. Returns how many. */
  async markStalePhonesUnverified(): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE users SET phone_number_verified = false
        WHERE phone_number IS NOT NULL AND phone_number_verified
          AND phone_verified_at IS NOT NULL
          AND phone_verified_at < now() - make_interval(days => $1)
       RETURNING id`,
      [PHONE_STALE_DAYS],
    );
    return rows.length;
  }

  /** The number to send a clinical notice or a link to, or null when it must not be used. */
  async deliverablePhone(userId: string): Promise<string | null> {
    const { rows } = await this.db.query(
      `SELECT phone_number FROM users
        WHERE id = $1 AND phone_number IS NOT NULL AND phone_number_verified
          AND phone_verified_at IS NOT NULL
          AND phone_verified_at >= now() - make_interval(days => $2)`,
      [userId, PHONE_STALE_DAYS],
    );
    return rows[0] ? String(rows[0].phone_number) : null;
  }
}
