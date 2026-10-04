import type { Queryable } from "../../lib/db/queryable";

// Earnings ledger and reconciliation queries (P5-06). Only this file and repo.ts talk to the
// database for payments. The ledger is append-only: rows are added, never changed.

const MONEY_TAKEN = "('captured', 'partially_refunded', 'refunded')";

export type CapturedForCheck = {
  id: string;
  gatewayPaymentId: string;
  gatewayOrderId: string;
  amountPaise: number;
};

export class LedgerRepo {
  constructor(private readonly db: Queryable) {}

  /**
   * Writes the two capture entries for a payment that took money: the platform fee and the
   * doctor's share (the rest). Unique indexes make a repeat do nothing. Returns whether anything
   * was written.
   */
  async recordCapture(paymentId: string, platformFeePaise: number): Promise<boolean> {
    const { rows } = await this.db.query(
      "INSERT INTO earnings_ledger (doctor_id, payment_id, entry_type, amount_paise)" +
        " SELECT a.doctor_id, p.id, v.entry_type, v.amount" +
        " FROM payments p JOIN appointments a ON a.id = p.appointment_id" +
        " CROSS JOIN LATERAL (VALUES" +
        "   ('doctor_share', p.amount_paise::bigint - $2::bigint)," +
        "   ('platform_fee', $2::bigint)) AS v(entry_type, amount)" +
        " WHERE p.id = $1 AND p.status IN " +
        MONEY_TAKEN +
        " ON CONFLICT DO NOTHING RETURNING id",
      [paymentId, platformFeePaise],
    );
    return rows.length > 0;
  }

  /** Payments that took money more than a few minutes ago and still lack their capture entries. */
  async missingCaptureEntries(limit: number): Promise<{ id: string; amountPaise: number }[]> {
    const { rows } = await this.db.query(
      "SELECT p.id, p.amount_paise FROM payments p WHERE p.status IN " +
        MONEY_TAKEN +
        " AND p.captured_at < now() - interval '5 minutes'" +
        " AND (SELECT count(*) FROM earnings_ledger l WHERE l.payment_id = p.id" +
        "      AND l.entry_type IN ('doctor_share', 'platform_fee')) < 2" +
        " ORDER BY p.captured_at LIMIT $1",
      [limit],
    );
    return rows.map((r) => ({ id: String(r.id), amountPaise: Number(r.amount_paise) }));
  }

  /** Payments whose fee and share do not add up to what was paid. */
  async unbalanced(limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      "SELECT p.id FROM payments p JOIN earnings_ledger l ON l.payment_id = p.id" +
        " AND l.entry_type IN ('doctor_share', 'platform_fee')" +
        " WHERE p.status IN " +
        MONEY_TAKEN +
        " GROUP BY p.id, p.amount_paise HAVING sum(l.amount_paise) <> p.amount_paise" +
        " ORDER BY p.id LIMIT $1",
      [limit],
    );
    return rows.map((r) => String(r.id));
  }

  /** Money was taken, the time was never booked, and no refund was started. */
  async paidWithoutBooking(limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      "SELECT p.id FROM payments p JOIN appointments a ON a.id = p.appointment_id" +
        " WHERE p.status = 'captured' AND a.status IN ('held', 'expired')" +
        " AND p.captured_at < now() - interval '10 minutes'" +
        " AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = p.id AND r.status <> 'failed')" +
        " ORDER BY p.captured_at LIMIT $1",
      [limit],
    );
    return rows.map((r) => String(r.id));
  }

  /** Refunds that were meant to go to the gateway and never got an answer. */
  async stuckRefunds(limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      "SELECT id FROM refunds WHERE status = 'initiated' AND gateway_refund_id IS NULL" +
        " AND created_at < now() - interval '15 minutes' ORDER BY created_at LIMIT $1",
      [limit],
    );
    return rows.map((r) => String(r.id));
  }

  /** Signed gateway events that nobody has processed for a while. */
  async staleEventCount(): Promise<number> {
    const { rows } = await this.db.query(
      "SELECT count(*)::int AS n FROM payment_events WHERE processed_at IS NULL AND signature_ok" +
        " AND received_at < now() - interval '15 minutes'",
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Payments taken in the last `hours`, for the check against the gateway's own records. */
  async recentlyCaptured(hours: number, limit: number): Promise<CapturedForCheck[]> {
    const { rows } = await this.db.query(
      "SELECT p.id, p.gateway_payment_id, p.gateway_order_id, p.amount_paise FROM payments p" +
        " WHERE p.status IN " +
        MONEY_TAKEN +
        " AND p.gateway_payment_id IS NOT NULL AND p.captured_at > now() - make_interval(hours => $1)" +
        " ORDER BY p.captured_at DESC LIMIT $2",
      [hours, limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      gatewayPaymentId: String(r.gateway_payment_id),
      gatewayOrderId: String(r.gateway_order_id),
      amountPaise: Number(r.amount_paise),
    }));
  }

  /** A doctor's balance: everything the ledger owes them (shares, reversals and payouts). */
  async doctorBalance(doctorId: string): Promise<number> {
    const { rows } = await this.db.query(
      "SELECT coalesce(sum(amount_paise) FILTER (WHERE entry_type <> 'platform_fee'" +
        " AND entry_type <> 'platform_fee_reversal'), 0)::bigint AS owed" +
        " FROM earnings_ledger WHERE doctor_id = $1",
      [doctorId],
    );
    return Number(rows[0]?.owed ?? 0);
  }
}
