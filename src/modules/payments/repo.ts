import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { MAX_ORDERS_PER_APPOINTMENT } from "./schemas";

// Payment queries. Only this file talks to the database for payments.

export type PayableAppointment = {
  id: string;
  status: string;
  feePaise: number;
  holdExpiresAt: Date | null;
  accountUserId: string;
};

export type PaymentRow = {
  id: string;
  appointmentId: string;
  payerUserId: string;
  amountPaise: number;
  status: string;
  gatewayOrderId: string;
  gatewayPaymentId: string | null;
  holdExpiresAt: Date | null;
};

const PAYMENT_COLUMNS =
  "p.id, p.appointment_id, p.payer_user_id, p.amount_paise, p.status, p.gateway_order_id," +
  " p.gateway_payment_id, a.hold_expires_at";

function toPayment(r: Record<string, unknown>): PaymentRow {
  return {
    id: String(r.id),
    appointmentId: String(r.appointment_id),
    payerUserId: String(r.payer_user_id),
    amountPaise: Number(r.amount_paise),
    status: String(r.status),
    gatewayOrderId: String(r.gateway_order_id),
    gatewayPaymentId: r.gateway_payment_id === null ? null : String(r.gateway_payment_id),
    holdExpiresAt: r.hold_expires_at === null ? null : new Date(String(r.hold_expires_at)),
  };
}

export type RefundRow = {
  id: string;
  paymentId: string;
  amountPaise: number;
  status: string;
  gatewayRefundId: string | null;
};

function toRefund(r: Record<string, unknown>): RefundRow {
  return {
    id: String(r.id),
    paymentId: String(r.payment_id),
    amountPaise: Number(r.amount_paise),
    status: String(r.status),
    gatewayRefundId: r.gateway_refund_id === null ? null : String(r.gateway_refund_id),
  };
}

export class PaymentRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  async appointmentForPayment(id: string): Promise<PayableAppointment | null> {
    const { rows } = await this.db.query(
      `SELECT a.id, a.status, a.fee_paise, a.hold_expires_at, p.account_user_id
         FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`,
      [id],
    );
    const r = rows[0];
    return r
      ? {
          id: String(r.id),
          status: String(r.status),
          feePaise: Number(r.fee_paise),
          holdExpiresAt: r.hold_expires_at === null ? null : new Date(String(r.hold_expires_at)),
          accountUserId: String(r.account_user_id),
        }
      : null;
  }

  async findByKey(idempotencyKey: string): Promise<PaymentRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN appointments a ON a.id = p.appointment_id
        WHERE p.idempotency_key = $1`,
      [idempotencyKey],
    );
    return rows[0] ? toPayment(rows[0]) : null;
  }

  /**
   * Records an order. The appointment row is locked first, so concurrent requests for the same
   * appointment take turns and the cap on orders cannot be passed by a burst. The amount is read
   * from the appointment and must equal the amount the gateway order was made for, so a payment
   * row can never disagree with the fee the server holds. Refused (null) unless the appointment
   * is still held with a live hold, and while it has fewer than the maximum number of orders. A
   * repeated key raises the unique violation on payments_idempotency_idx for the service to turn
   * into a replay.
   */
  async createPayment(input: {
    id: string;
    appointmentId: string;
    payerUserId: string;
    amountPaise: number;
    gatewayOrderId: string;
    idempotencyKey: string;
  }): Promise<PaymentRow | null> {
    return this.tx.transaction(async (q) => {
      const locked = await q.query(
        `SELECT id FROM appointments
          WHERE id = $1 AND status = 'held' AND hold_expires_at > now() AND fee_paise = $2
          FOR UPDATE`,
        [input.appointmentId, input.amountPaise],
      );
      if (locked.rows.length === 0) return null;
      const { rows } = await q.query(
        `WITH ins AS (
           INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, gateway_order_id, idempotency_key)
           SELECT $1, a.id, $3, a.fee_paise, $4, $5
             FROM appointments a
            WHERE a.id = $2
              AND (SELECT count(*) FROM payments x WHERE x.appointment_id = a.id) < $6
           RETURNING id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, gateway_payment_id
         )
         SELECT i.*, (SELECT x.hold_expires_at FROM appointments x WHERE x.id = i.appointment_id) AS hold_expires_at
           FROM ins i`,
        [
          input.id,
          input.appointmentId,
          input.payerUserId,
          input.gatewayOrderId,
          input.idempotencyKey,
          MAX_ORDERS_PER_APPOINTMENT,
        ],
      );
      return rows[0] ? toPayment(rows[0]) : null;
    });
  }

  // ---- lookups and state changes used by settlement and webhooks ----

  async findById(id: string): Promise<PaymentRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN appointments a ON a.id = p.appointment_id WHERE p.id = $1`,
      [id],
    );
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async findByOrderId(orderId: string): Promise<PaymentRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN appointments a ON a.id = p.appointment_id
        WHERE p.gateway_order_id = $1`,
      [orderId],
    );
    return rows[0] ? toPayment(rows[0]) : null;
  }

  /**
   * created or failed becomes captured, once. A captured payment never goes back (so a late
   * "failed" event cannot undo money that was taken), and a failed one can still succeed (the
   * customer may retry on the same order). Returns false when it was not in a state that allows it.
   * A second paid payment for one appointment raises 23505 on payments_one_paid_idx.
   */
  async markCaptured(id: string, gatewayPaymentId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE payments SET status = 'captured', gateway_payment_id = $2, captured_at = now(), failure_code = NULL
        WHERE id = $1 AND status IN ('created', 'failed')
          AND (gateway_payment_id IS NULL OR gateway_payment_id = $2)
        RETURNING id`,
      [id, gatewayPaymentId],
    );
    return rows.length === 1;
  }

  /** An attempt that did not go through. Only an open payment can fail; a captured one stays captured. */
  async markFailed(id: string, failureCode: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE payments SET status = 'failed', failure_code = $2 WHERE id = $1 AND status = 'created' RETURNING id`,
      [id, failureCode],
    );
    return rows.length === 1;
  }

  // ---- gateway events ----

  /** Stores an event once. Returns the new row id, or null when this event id was seen before. */
  async insertEvent(input: {
    paymentId: string | null;
    gatewayEventId: string;
    eventType: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<number | null> {
    const { rows } = await this.db.query(
      `INSERT INTO payment_events (payment_id, gateway_event_id, event_type, payload, signature_ok)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (gateway_event_id) DO NOTHING RETURNING id`,
      [
        input.paymentId,
        input.gatewayEventId,
        input.eventType,
        JSON.stringify(input.payload),
        input.signatureOk,
      ],
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  async findEvent(id: number): Promise<{
    id: number;
    paymentId: string | null;
    eventType: string;
    payload: Record<string, unknown>;
    signatureOk: boolean;
    processedAt: Date | null;
  } | null> {
    const { rows } = await this.db.query(
      "SELECT id, payment_id, event_type, payload, signature_ok, processed_at FROM payment_events WHERE id = $1",
      [id],
    );
    const r = rows[0];
    return r
      ? {
          id: Number(r.id),
          paymentId: r.payment_id === null ? null : String(r.payment_id),
          eventType: String(r.event_type),
          payload: r.payload as Record<string, unknown>,
          signatureOk: r.signature_ok === true,
          processedAt: r.processed_at === null ? null : new Date(String(r.processed_at)),
        }
      : null;
  }

  /** Marks an event handled, once (the database allows nothing else to change on it). */
  async markEventProcessed(id: number): Promise<void> {
    await this.db.query(
      "UPDATE payment_events SET processed_at = now() WHERE id = $1 AND processed_at IS NULL",
      [id],
    );
  }

  /** Events stored and signed but not yet handled, oldest first: the sweep for a lost job. */
  async unprocessedEventIds(limit: number): Promise<number[]> {
    const { rows } = await this.db.query(
      "SELECT id FROM payment_events WHERE processed_at IS NULL AND signature_ok ORDER BY id LIMIT $1",
      [limit],
    );
    return rows.map((r) => Number(r.id));
  }

  // ---- refunds ----

  async findRefundByKey(idempotencyKey: string): Promise<RefundRow | null> {
    const { rows } = await this.db.query(
      `SELECT id, payment_id, amount_paise, status, gateway_refund_id FROM refunds WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return rows[0] ? toRefund(rows[0]) : null;
  }

  /** Refunds that are started or done for a payment, in paise: the part that cannot be refunded again. */
  async refundedOrPending(paymentId: string): Promise<number> {
    const { rows } = await this.db.query(
      "SELECT COALESCE(sum(amount_paise), 0)::bigint AS n FROM refunds WHERE payment_id = $1 AND status IN ('initiated', 'processed')",
      [paymentId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Starts a refund row. Null when this key already started one (a repeat). */
  async insertRefund(input: {
    id: string;
    paymentId: string;
    amountPaise: number;
    reason: string;
    initiatedBy: string | null;
    idempotencyKey: string;
  }): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO refunds (id, payment_id, amount_paise, reason, initiated_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [
        input.id,
        input.paymentId,
        input.amountPaise,
        input.reason,
        input.initiatedBy,
        input.idempotencyKey,
      ],
    );
    return rows.length === 1;
  }

  async setRefundGatewayId(id: string, gatewayRefundId: string): Promise<void> {
    await this.db.query(
      "UPDATE refunds SET gateway_refund_id = $2 WHERE id = $1 AND gateway_refund_id IS NULL",
      [id, gatewayRefundId],
    );
  }

  /** A second paid payment for one appointment: it stays out of the paid set and is refunded. */
  async markDuplicate(id: string, gatewayPaymentId: string): Promise<void> {
    await this.db.query(
      `UPDATE payments SET status = 'failed', failure_code = 'duplicate_paid', gateway_payment_id = $2
        WHERE id = $1 AND status IN ('created', 'failed')`,
      [id, gatewayPaymentId],
    );
  }
}
