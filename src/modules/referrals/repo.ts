import type { Queryable, TxRunner } from "../../lib/db/queryable";

// Referral queries (P5-10). Only this file talks to the database for referrals.

export type RedeemOutcome =
  | "created"
  | "unknown_code"
  | "own_code"
  | "already_referred"
  | "not_new"
  | "cap_reached"
  | "cycle";

export class ReferralRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  async codeFor(userId: string): Promise<string | null> {
    const { rows } = await this.db.query("SELECT code FROM referral_codes WHERE user_id = $1", [
      userId,
    ]);
    return rows[0] ? String(rows[0].code) : null;
  }

  /** Stores a new code. False when the account already has one or the code is taken. */
  async insertCode(userId: string, code: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id",
      [userId, code],
    );
    return rows.length === 1;
  }

  async counts(userId: string): Promise<{ invited: number; rewarded: number }> {
    const { rows } = await this.db.query(
      `SELECT count(*) FILTER (WHERE status IN ('pending', 'rewarded'))::int AS invited,
              count(*) FILTER (WHERE status = 'rewarded')::int AS rewarded
         FROM referrals WHERE referrer_user_id = $1`,
      [userId],
    );
    return { invited: Number(rows[0]?.invited ?? 0), rewarded: Number(rows[0]?.rewarded ?? 0) };
  }

  /** Whether this account was referred, or has already had a consultation booked (so is not new). */
  async redeemState(userId: string): Promise<{ referred: boolean; hasBooking: boolean }> {
    const { rows } = await this.db.query(
      `SELECT EXISTS (SELECT 1 FROM referrals WHERE referred_user_id = $1) AS referred,
              EXISTS (SELECT 1 FROM appointments
                       WHERE booked_by_user_id = $1
                         AND status IN ('scheduled', 'in_progress', 'completed', 'no_show')) AS has_booking`,
      [userId],
    );
    return { referred: rows[0]?.referred === true, hasBooking: rows[0]?.has_booking === true };
  }

  /**
   * Records that `referredUserId` joined with `code`. Every rule is checked inside one transaction
   * that locks the referrer's code row, so the cap holds even when many people use one code at the
   * same moment. The first failing rule is returned; nothing is written then.
   */
  async redeem(input: {
    id: string;
    referredUserId: string;
    code: string;
    cap: number;
    rewardPaise: number;
  }): Promise<RedeemOutcome> {
    return this.tx.transaction(async (q) => {
      const owner = await q.query("SELECT user_id FROM referral_codes WHERE code = $1 FOR UPDATE", [
        input.code,
      ]);
      const referrer = owner.rows[0] ? String(owner.rows[0].user_id) : null;
      if (!referrer) return "unknown_code";
      if (referrer === input.referredUserId) return "own_code";

      const state = await q.query(
        `SELECT EXISTS (SELECT 1 FROM referrals WHERE referred_user_id = $1) AS referred,
                EXISTS (SELECT 1 FROM appointments
                         WHERE booked_by_user_id = $1
                           AND status IN ('scheduled', 'in_progress', 'completed', 'no_show')) AS has_booking,
                -- Two people cannot refer each other: the referrer was themselves brought by this person.
                EXISTS (SELECT 1 FROM referrals WHERE referred_user_id = $2 AND referrer_user_id = $1) AS cycle`,
        [input.referredUserId, referrer],
      );
      const s = state.rows[0];
      if (s?.referred === true) return "already_referred";
      if (s?.has_booking === true) return "not_new";
      if (s?.cycle === true) return "cycle";

      const used = await q.query(
        "SELECT count(*)::int AS n FROM referrals WHERE referrer_user_id = $1 AND status IN ('pending', 'rewarded')",
        [referrer],
      );
      if (Number(used.rows[0]?.n ?? 0) >= input.cap) return "cap_reached";

      const inserted = await q.query(
        `INSERT INTO referrals (id, referrer_user_id, referred_user_id, reward_paise)
         VALUES ($1, $2, $3, $4) ON CONFLICT (referred_user_id) DO NOTHING RETURNING id`,
        [input.id, referrer, input.referredUserId, input.rewardPaise],
      );
      return inserted.rows.length === 1 ? "created" : "already_referred";
    });
  }

  /**
   * The referred person's first consultation was completed: the referral earns its reward. Once
   * only. Returns the reward in paise, or null when there was nothing to reward.
   */
  async reward(referredUserId: string): Promise<number | null> {
    const { rows } = await this.db.query(
      `UPDATE referrals SET status = 'rewarded', rewarded_at = now()
        WHERE referred_user_id = $1 AND status = 'pending' RETURNING reward_paise`,
      [referredUserId],
    );
    return rows[0] ? Number(rows[0].reward_paise) : null;
  }
}
