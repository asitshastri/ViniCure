import { createHash } from "node:crypto";
import type { PaymentProvider } from "../../lib/adapters/types";
import { uuidv7 } from "../../lib/ids";
import { logger } from "../../lib/logging/logger";
import type { PaymentRepo, PaymentRow } from "./repo";

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
    const { repo } = this.deps;
    const key = refundKey(payment.id, purpose);
    if (!payment.gatewayPaymentId) {
      // Money cannot have been taken without a gateway payment id; nothing to give back.
      logger.error({ event: "refund_without_gateway_payment", purpose });
      return;
    }
    let refund = await repo.findRefundByKey(key);
    if (!refund) {
      const remaining = payment.amountPaise - (await repo.refundedOrPending(payment.id));
      if (remaining <= 0) return;
      const id = uuidv7();
      await repo.insertRefund({
        id,
        paymentId: payment.id,
        amountPaise: remaining,
        reason,
        initiatedBy: null,
        idempotencyKey: key,
      });
      refund = await repo.findRefundByKey(key);
    }
    if (!refund || refund.gatewayRefundId) return;
    const { refundId } = await this.deps.gateway().refund({
      paymentId: payment.gatewayPaymentId,
      amountPaise: refund.amountPaise,
      reason,
    });
    await repo.setRefundGatewayId(refund.id, refundId);
    logger.info({ event: "refund_started", purpose });
  }
}
