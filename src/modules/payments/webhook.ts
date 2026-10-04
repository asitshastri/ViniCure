import { createHash } from "node:crypto";
import type { PaymentProvider } from "../../lib/adapters/types";
import { logger } from "../../lib/logging/logger";
import type { PaymentRepo } from "./repo";
import type { SettlementService } from "./settlement";
import {
  CAPTURE_EVENTS,
  FAILURE_EVENTS,
  sanitizeWebhook,
  type GatewayEvent,
} from "./webhook-parse";

// The Razorpay webhook (P5-05). `receive` is the fast part the route calls: check the signature
// over the raw body, keep the few facts we need, store the event once, and hand it to the worker.
// `process` is the worker's part. Events can arrive twice, late, or in any order; the rules in
// SettlementService (captured is final, failed can still be paid) make the order not matter.

type Deps = {
  repo: PaymentRepo;
  gateway: () => PaymentProvider;
  settlement: SettlementService;
  /** Hands a stored event to the worker. */
  enqueue: (eventId: number) => Promise<unknown>;
};

export type ReceiveResult = "accepted" | "duplicate" | "ignored" | "bad_signature";

const HEADER_ID = /^[A-Za-z0-9_\-]{8,100}$/;

export class WebhookService {
  constructor(private readonly deps: Deps) {}

  async receive(input: {
    rawBody: string;
    signature: string;
    eventIdHeader: string | null;
  }): Promise<ReceiveResult> {
    // Signature first, over the exact bytes, before anything is parsed or stored.
    if (
      !this.deps.gateway().verifyWebhook({ rawBody: input.rawBody, signature: input.signature })
    ) {
      return "bad_signature";
    }
    const event = sanitizeWebhook(input.rawBody);
    if (!event) return "ignored";

    // The gateway's event id is in a header; without one the body itself identifies the event.
    const gatewayEventId =
      input.eventIdHeader && HEADER_ID.test(input.eventIdHeader)
        ? input.eventIdHeader
        : createHash("sha256").update(input.rawBody).digest("hex");

    const payment = event.orderId ? await this.deps.repo.findByOrderId(event.orderId) : null;
    const eventId = await this.deps.repo.insertEvent({
      paymentId: payment?.id ?? null,
      gatewayEventId,
      eventType: event.event,
      payload: event,
      signatureOk: true,
    });
    if (eventId === null) return "duplicate";

    try {
      await this.deps.enqueue(eventId);
    } catch (error) {
      // Stored is what matters: the sweep picks it up. The gateway is told "received".
      logger.error({ event: "webhook_enqueue_failed", err: error });
    }
    return "accepted";
  }

  /** Handles one stored event. Safe to run twice: it only acts on events not yet marked handled. */
  async process(eventId: number): Promise<"handled" | "skipped"> {
    const { repo } = this.deps;
    const stored = await repo.findEvent(eventId);
    if (!stored || stored.processedAt || !stored.signatureOk) return "skipped";
    const event = stored.payload as unknown as GatewayEvent;

    if (CAPTURE_EVENTS.has(event.event)) {
      const payment = event.orderId ? await repo.findByOrderId(event.orderId) : null;
      if (!payment || !event.paymentId) {
        // Money for an order we never made: someone has to look.
        logger.error({ event: "payment_for_unknown_order" });
      } else {
        await this.deps.settlement.settle(payment, event.paymentId);
      }
    } else if (FAILURE_EVENTS.has(event.event)) {
      const payment = event.orderId ? await repo.findByOrderId(event.orderId) : null;
      // A failed attempt closes nothing for good: the customer may pay again on the same order.
      if (payment) await repo.markFailed(payment.id, event.errorCode ?? "failed");
    }
    // Refund and other events are kept for the record; refunds are completed in P5-07.

    await repo.markEventProcessed(eventId);
    return "handled";
  }

  /** Re-queues events that were stored but never handled (a lost job). Returns how many. */
  async sweep(limit = 100): Promise<number> {
    const ids = await this.deps.repo.unprocessedEventIds(limit);
    for (const id of ids) await this.deps.enqueue(id);
    return ids.length;
  }
}
