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
}
