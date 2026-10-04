import { createHash } from "node:crypto";
import type { PaymentProvider } from "../../lib/adapters/types";
import { uuidv7 } from "../../lib/ids";
import { logger } from "../../lib/logging/logger";
import { errors } from "../../lib/errors/app-error";
import type { PaymentRepo, PaymentRow, RefundRow } from "./repo";

// Refunds the system starts by itself (P5-05): a payment that arrived for a time that is gone,
// or a second payment for the same booking. Refund rules, partial refunds, the admin endpoint and
// the ledger reversal belong to P5-07 and extend this class.

type Deps = { repo: PaymentRepo; gateway: () => PaymentProvider };

/** The same reason for the same payment always makes the same key, so a retry cannot refund twice. */
export const refundKey = (paymentId: string, purpose: string): string =>
  createHash("sha256").update(`refund\n${paymentId}\n${purpose}`).digest("hex");

export class RefundService {
  constructor(private readonly deps: Deps) {}

  /**
   * Gives back whatever has not been refunded yet. Safe to call again: the refund row is keyed, a
   * repeat finds it, and the gateway is only asked while no gateway refund id is recorded.
   * `purpose` is a short code (for example "slot_lost"), part of the key and the stored reason.
   */
  async refundInFull(payment: PaymentRow, purpose: string, reason: string): Promise<void> {
    await this.refund(payment, { purpose, reason, amountPaise: null, initiatedBy: null });
  }

  /**
   * Starts a refund of `amountPaise` (null: everything not yet refunded). The amount can never
   * exceed what is left of the payment. Returns the refund, or null when nothing was left to give
   * back. A repeat with the same purpose returns the same refund and does not call the gateway
   * twice. The ledger and the payment follow when the gateway confirms (`completeRefund`).
   */
  async refund(
    payment: PaymentRow,
    input: {
      purpose: string;
      reason: string;
      amountPaise: number | null;
      initiatedBy: string | null;
    },
  ): Promise<RefundRow | null> {
    const { repo } = this.deps;
    const key = refundKey(payment.id, input.purpose);
    if (!payment.gatewayPaymentId) {
      // Money cannot have been taken without a gateway payment id; nothing to give back.
      logger.error({ event: "refund_without_gateway_payment", purpose: input.purpose });
      return null;
    }
    let refund = await repo.findRefundByKey(key);
    if (!refund) {
      const started = await repo.startRefund({
        id: uuidv7(),
        paymentId: payment.id,
        amountPaise: input.amountPaise,
        reason: input.reason,
        initiatedBy: input.initiatedBy,
        idempotencyKey: key,
      });
      if (started === "nothing_left") return null;
      if (started === "too_much") {
        throw errors.conflict({ detail: "That is more than is left to refund." });
      }
      refund = await repo.findRefundByKey(key);
    }
    if (!refund) return null;
    if (refund.gatewayRefundId || refund.status !== "initiated") return refund;
    const { refundId } = await this.deps.gateway().refund({
      paymentId: payment.gatewayPaymentId,
      amountPaise: refund.amountPaise,
      reason: input.reason,
    });
    await repo.setRefundGatewayId(refund.id, refundId);
    logger.info({ event: "refund_started", purpose: input.purpose });
    return (await repo.findRefundByKey(key)) ?? refund;
  }

  /**
   * A confirmed appointment was cancelled by the doctor or an admin: the patient paid for a
   * consultation that will not happen, so the whole payment goes back. A patient's own
   * cancellation is not refunded here: the terms for that are the business's to set (TODO.md),
   * and an admin can refund by hand meanwhile. Safe to repeat.
   */
  async refundForCancellation(
    appointmentId: string,
    by: "patient" | "doctor" | "admin",
    from: string,
  ): Promise<void> {
    if (by === "patient" || from !== "scheduled") return;
    const payment = await this.deps.repo.findPaidByAppointment(appointmentId);
    if (!payment) return;
    await this.refundInFull(payment, `cancelled_by_${by}`, `cancelled by the ${by}`);
  }
}
