import { AdapterError, type PaymentProvider } from "../../lib/adapters/types";
import { logger } from "../../lib/logging/logger";
import type { LedgerService } from "./ledger";
import type { LedgerRepo } from "./ledger-repo";

// The daily check that our books and the gateway agree (P5-06). It repairs what can be repaired
// safely (a capture whose ledger entries were never written) and raises one alert line for
// everything else. It never moves money by itself.

export type ReconcileReport = {
  ledgerRepaired: number;
  missingLedger: number;
  unbalanced: number;
  paidWithoutBooking: number;
  stuckRefunds: number;
  staleEvents: number;
  gatewayChecked: number;
  gatewayMismatch: number;
  gatewayUnreachable: boolean;
  /** Booked and paid, but no invoice after ten minutes: asked the worker again. */
  invoicesRequeued: number;
};

const LIMIT = 200;
const GATEWAY_WINDOW_HOURS = 48;
const GATEWAY_CHECKS = 200;
const OK_STATUSES = new Set(["captured", "refunded", "partially_refunded"]);

type Deps = {
  repo: LedgerRepo;
  ledger: LedgerService;
  gateway: () => PaymentProvider;
  /** Finds paid bookings with no invoice and asks the worker to draw them (P5-08). */
  invoices?: {
    missing: (limit: number) => Promise<string[]>;
    enqueue: (paymentId: string) => Promise<unknown>;
  };
};

export class ReconcileService {
  constructor(private readonly deps: Deps) {}

  async run(): Promise<ReconcileReport> {
    const { repo, ledger } = this.deps;

    // 1. A capture without its ledger entries is repaired, and counted so it is not forgotten.
    let ledgerRepaired = 0;
    const missing = await repo.missingCaptureEntries(LIMIT);
    for (const p of missing) {
      if (await ledger.recordCapture(p)) ledgerRepaired += 1;
    }
    const stillMissing = (await repo.missingCaptureEntries(LIMIT)).length;

    // 2. Books that do not add up, money kept for no booking, refunds that never reached the
    //    gateway, events nobody handled.
    const unbalanced = await repo.unbalanced(LIMIT);
    const paidWithoutBooking = await repo.paidWithoutBooking(LIMIT);
    const stuckRefunds = await repo.stuckRefunds(LIMIT);
    const staleEvents = await repo.staleEventCount();

    // 3. The gateway's own record of recent payments must agree with ours.
    let gatewayChecked = 0;
    let gatewayMismatch = 0;
    let gatewayUnreachable = false;
    for (const p of await repo.recentlyCaptured(GATEWAY_WINDOW_HOURS, GATEWAY_CHECKS)) {
      try {
        const live = await this.deps.gateway().fetchPayment(p.gatewayPaymentId);
        gatewayChecked += 1;
        if (
          live.orderId !== p.gatewayOrderId ||
          live.amountPaise !== p.amountPaise ||
          !OK_STATUSES.has(live.status)
        ) {
          gatewayMismatch += 1;
          logger.error({ event: "payment_reconcile_gateway_mismatch", paymentId: p.id });
        }
      } catch (error) {
        if (error instanceof AdapterError && error.kind === "rejected") {
          // The gateway has no such payment: our record is wrong.
          gatewayChecked += 1;
          gatewayMismatch += 1;
          logger.error({ event: "payment_reconcile_gateway_mismatch", paymentId: p.id });
          continue;
        }
        // The gateway is down. Stop here; tomorrow's run (or the retry) looks again.
        gatewayUnreachable = true;
        break;
      }
    }

    // 4. A booking that was paid for and never got its invoice is queued again.
    let invoicesRequeued = 0;
    for (const paymentId of (await this.deps.invoices?.missing(LIMIT)) ?? []) {
      try {
        await this.deps.invoices?.enqueue(paymentId);
        invoicesRequeued += 1;
      } catch (error) {
        logger.warn({ event: "invoice_requeue_failed", err: error });
        break;
      }
    }

    const report: ReconcileReport = {
      invoicesRequeued,
      ledgerRepaired,
      missingLedger: stillMissing,
      unbalanced: unbalanced.length,
      paidWithoutBooking: paidWithoutBooking.length,
      stuckRefunds: stuckRefunds.length,
      staleEvents,
      gatewayChecked,
      gatewayMismatch,
      gatewayUnreachable,
    };
    const problems =
      report.missingLedger +
      report.unbalanced +
      report.paidWithoutBooking +
      report.stuckRefunds +
      report.staleEvents +
      report.gatewayMismatch;
    if (problems > 0 || ledgerRepaired > 0) {
      // One line the alerting rule watches for (backend-architecture.md section on alerts).
      logger.error({
        event: "payment_reconcile_problem",
        ...report,
        paymentIds: [...unbalanced, ...paidWithoutBooking].slice(0, 20),
        refundIds: stuckRefunds.slice(0, 20),
      });
    } else {
      logger.info({ event: "payment_reconcile_ok", ...report });
    }
    return report;
  }
}
