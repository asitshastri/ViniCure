import { createHash } from "node:crypto";
import type { PaymentProvider } from "../../lib/adapters/types";
import { AdapterError } from "../../lib/adapters/types";
import { errors } from "../../lib/errors/app-error";
import { logger } from "../../lib/logging/logger";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { PayableAppointment, PaymentRepo, PaymentRow } from "./repo";
import {
  MAX_ORDERS_PER_APPOINTMENT,
  type AdminRefundBody,
  type OrderView,
  type RefundView,
  type VerifyBody,
  type VerifyView,
} from "./schemas";
import type { RefundService } from "./refunds";
import type { SettlementService } from "./settlement";

// Starting a payment (P5-03). The server decides the amount (the fee copied onto the appointment
// when the slot was held), creates a fresh gateway order for each attempt, and records it. The
// browser only ever receives an order to open in the checkout widget.

type Deps = {
  repo: PaymentRepo;
  gateway: () => PaymentProvider;
  /** The public key id for the checkout widget. */
  publicKeyId: () => string;
  /** Settles a payment the browser says was made. */
  settlement?: Pick<SettlementService, "settle">;
  /** Starts refunds (admin endpoint, cancellations). */
  refunds?: Pick<RefundService, "refund">;
};

/** One key per (person, appointment, client key): the same request always maps to the same row. */
export function paymentKey(userId: string, appointmentId: string, clientKey: string): string {
  return createHash("sha256")
    .update(`order\n${userId}\n${appointmentId}\n${clientKey}`)
    .digest("hex");
}

export class PaymentService {
  constructor(private readonly deps: Deps) {}

  private view(p: PaymentRow): OrderView {
    return {
      paymentId: p.id,
      orderId: p.gatewayOrderId,
      amountPaise: p.amountPaise,
      currency: "INR",
      keyId: this.deps.publicKeyId(),
      holdExpiresAt: (p.holdExpiresAt ?? new Date(0)).toISOString(),
    };
  }

  private checkPayable(principal: Principal, appt: PayableAppointment | null): PayableAppointment {
    // Someone else's appointment is the same 404 as one that does not exist.
    if (!appt) throw errors.notFound();
    assertAllowed(can.payment.pay(principal, { ownerUserId: appt.accountUserId }));
    if (
      appt.status !== "held" ||
      !appt.holdExpiresAt ||
      appt.holdExpiresAt.getTime() <= Date.now()
    ) {
      throw errors.conflict({
        detail: "This time is no longer held for you. Choose a time again.",
      });
    }
    if (appt.feePaise <= 0) {
      throw errors.conflict({ detail: "There is nothing to pay for this booking." });
    }
    return appt;
  }

  /**
   * Makes (or replays) the order for a held appointment. `clientKey` is the caller's
   * Idempotency-Key: the same key returns the same order, a new key is a new attempt.
   */
  async createOrder(
    principal: Principal,
    input: { appointmentId: string },
    clientKey: string,
  ): Promise<OrderView> {
    const key = paymentKey(principal.userId, input.appointmentId, clientKey);

    // A repeat of an earlier request: same answer, no second order at the gateway.
    const earlier = await this.deps.repo.findByKey(key);
    if (earlier) return this.view(earlier);

    const appt = this.checkPayable(
      principal,
      await this.deps.repo.appointmentForPayment(input.appointmentId),
    );

    let orderId: string;
    try {
      ({ orderId } = await this.deps.gateway().createOrder({
        amountPaise: appt.feePaise,
        currency: "INR",
        // The appointment id is a random UUID, not personal data; the receipt shows it to us in the dashboard.
        receipt: appt.id.replaceAll("-", "").slice(0, 32),
        notes: { appointment: appt.id },
      }));
    } catch (error) {
      if (error instanceof AdapterError) {
        logger.warn({ event: "payment_order_failed", kind: error.kind });
        throw errors.unavailable({
          detail:
            "Payments are not available right now. Your time stays held until the timer ends. Try again in a moment.",
        });
      }
      throw error;
    }

    let row: PaymentRow | null;
    try {
      row = await this.deps.repo.createPayment({
        id: uuidv7(),
        appointmentId: appt.id,
        payerUserId: principal.userId,
        amountPaise: appt.feePaise,
        gatewayOrderId: orderId,
        idempotencyKey: key,
      });
    } catch (error) {
      // The same request arrived twice at once and the other one won: answer with its order.
      const e = error as { code?: string; constraint?: string };
      if (e.code === "23505" && e.constraint === "payments_idempotency_idx") {
        const winner = await this.deps.repo.findByKey(key);
        if (winner) return this.view(winner);
      }
      throw error;
    }
    if (!row) {
      // The hold ended, or the appointment already has its orders, between the check and the write.
      throw errors.conflict({
        detail: `This time is no longer held, or ${MAX_ORDERS_PER_APPOINTMENT} payment attempts have been made. Choose a time again.`,
      });
    }
    return this.view(row);
  }

  /**
   * The browser says a payment was made and hands over the widget's signature. The signature is
   * checked with the key secret, and then the gateway itself is asked what happened: the browser
   * is never believed about money. The result is the same settlement the webhook runs, so the two
   * can arrive in either order.
   */
  async verify(principal: Principal, input: VerifyBody): Promise<VerifyView> {
    const payment = await this.deps.repo.findById(input.paymentId);
    const appt = payment ? await this.deps.repo.appointmentForPayment(payment.appointmentId) : null;
    // Someone else's payment is the same 404 as one that does not exist.
    if (!payment || !appt) throw errors.notFound();
    assertAllowed(can.payment.pay(principal, { ownerUserId: appt.accountUserId }));

    const genuine = this.deps.gateway().verifyCheckoutSignature({
      orderId: payment.gatewayOrderId,
      paymentId: input.gatewayPaymentId,
      signature: input.signature,
    });
    if (!genuine) {
      logger.warn({ event: "checkout_signature_invalid" });
      throw errors.validation([
        { path: "signature", message: "We could not confirm this payment." },
      ]);
    }
    if (!this.deps.settlement) throw errors.internal({ cause: new Error("settlement not wired") });
    try {
      const result = await this.deps.settlement.settle(payment, input.gatewayPaymentId);
      const status =
        result === "captured"
          ? "paid"
          : result === "refunded"
            ? "refunded"
            : result === "pending"
              ? "pending"
              : "problem";
      return { status, appointmentId: payment.appointmentId };
    } catch (error) {
      if (error instanceof AdapterError) {
        // The webhook will finish the job if the gateway is slow; the screen can ask again.
        throw errors.unavailable({
          detail:
            "We could not confirm your payment yet. Do not pay again. Check your appointments in a few minutes.",
        });
      }
      throw error;
    }
  }

  /**
   * An admin refunds a captured payment, in full or in part (P5-07). Needs the admin role and a
   * recent sign-in (the route checks the second). The amount can never be more than what is left;
   * the reason is stored; a repeat with the same Idempotency-Key is the same refund. The ledger
   * and the payment total follow when the gateway confirms.
   */
  async refundAsAdmin(
    principal: Principal,
    paymentId: string,
    input: AdminRefundBody,
    clientKey: string,
  ): Promise<RefundView> {
    const payment = await this.deps.repo.findById(paymentId);
    // Not an admin: the same 404 as a payment that does not exist.
    if (!payment) throw errors.notFound();
    assertAllowed(can.payment.refund(principal, { ownerUserId: payment.payerUserId }));
    if (!["captured", "partially_refunded"].includes(payment.status)) {
      throw errors.conflict({ detail: "Only a payment that was received can be refunded." });
    }
    if (!this.deps.refunds) throw errors.internal({ cause: new Error("refunds not wired") });
    const purpose = `admin:${createHash("sha256").update(clientKey).digest("hex")}`;
    try {
      const refund = await this.deps.refunds.refund(payment, {
        purpose,
        reason: input.reason,
        amountPaise: input.amountPaise ?? null,
        initiatedBy: principal.userId,
      });
      if (!refund) throw errors.conflict({ detail: "Nothing is left to refund on this payment." });
      return {
        refundId: refund.id,
        status: refund.status as RefundView["status"],
        amountPaise: refund.amountPaise,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        logger.warn({ event: "admin_refund_failed", kind: error.kind });
        throw error.kind === "rejected"
          ? errors.conflict({ detail: "The payment provider refused this refund." })
          : errors.unavailable({
              detail: "The payment provider is not available. Try again in a moment.",
            });
      }
      throw error;
    }
  }
}
