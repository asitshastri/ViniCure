import type { PaymentProvider } from "../../lib/adapters/types";
import { logger } from "../../lib/logging/logger";
import type { PaymentRepo, PaymentRow } from "./repo";
import type { RefundService } from "./refunds";

// Settling a payment (P5-04 and P5-05): the one place that turns "the customer paid" into our
// state. The checkout screen and the webhook both end here, so they cannot disagree.
//
// Rules:
//   - The gateway is asked for the payment itself. Neither the browser nor the webhook body is
//     believed about status or amount.
//   - Money counts only when the gateway says "captured" for the right order and the right amount.
//   - Captured is final: a late "failed" event cannot undo it. A failed attempt can still be paid.
//   - The appointment is confirmed, or the money is given back, every time this runs, so a crash
//     between the two steps is repaired by the next call.

export type SettleResult =
  | "captured" // paid, and the appointment is confirmed
  | "refunded" // paid, but the time is gone (or paid twice): refund started
  | "pending" // the gateway does not say captured (yet)
  | "mismatch"; // the gateway's payment does not match our order: nothing changes, an alert is raised

export type Confirm = (
  appointmentId: string,
) => Promise<"confirmed" | "confirmed_late" | "already" | "slot_lost" | "not_payable">;

type Deps = {
  repo: PaymentRepo;
  gateway: () => PaymentProvider;
  confirmAppointment: Confirm;
  refunds: RefundService;
  /** Runs as soon as a payment is known to be captured (the earnings ledger, P5-06). Must be safe to repeat. */
  onCaptured?: (payment: PaymentRow) => Promise<void>;
};

export class SettlementService {
  constructor(private readonly deps: Deps) {}

  async settle(payment: PaymentRow, gatewayPaymentId: string): Promise<SettleResult> {
    const { repo, refunds } = this.deps;
    // An unreachable gateway throws, and the caller (the job, or the browser's retry) comes back.
    const live = await this.deps.gateway().fetchPayment(gatewayPaymentId);

    if (live.orderId !== payment.gatewayOrderId || live.amountPaise !== payment.amountPaise) {
      logger.error({ event: "payment_mismatch", paymentId: payment.id });
      return "mismatch";
    }
    if (live.status !== "captured") return "pending";

    try {
      await repo.markCaptured(payment.id, gatewayPaymentId);
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      if (e.code === "23505" && e.constraint === "payments_one_paid_idx") {
        // Another payment already paid for this appointment: give this one back.
        await repo.markDuplicate(payment.id, gatewayPaymentId);
        const dup = await repo.findById(payment.id);
        if (dup) await refunds.refundInFull(dup, "duplicate_paid", "paid twice for one booking");
        return "refunded";
      }
      throw error;
    }

    const current = await repo.findById(payment.id);
    if (!current || !["captured", "partially_refunded", "refunded"].includes(current.status)) {
      return "pending";
    }
    // Captured with a different gateway payment than this one: the order was paid twice.
    if (current.gatewayPaymentId !== gatewayPaymentId) {
      logger.error({ event: "payment_second_capture_on_order", paymentId: payment.id });
      return "mismatch";
    }

    // The money arrived, so the books say so before anything else can go wrong; a refund that
    // follows (lost time, second payment) is a reversal of these entries (P5-07).
    await this.deps.onCaptured?.(current);

    const outcome = await this.deps.confirmAppointment(current.appointmentId);
    if (outcome === "slot_lost" || outcome === "not_payable") {
      await refunds.refundInFull(
        current,
        outcome,
        outcome === "slot_lost"
          ? "the time was taken before payment arrived"
          : "the booking was no longer open",
      );
      return "refunded";
    }
    return "captured";
  }
}
