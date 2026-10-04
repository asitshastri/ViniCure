import type { PaymentProvider } from "../../lib/adapters/types";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppointmentService } from "../scheduling/appointments";
import { AppointmentRepo } from "../scheduling/appointments-repo";
import { PatientRepo } from "../patients/repo";
import { InvoiceRepo } from "./invoice-repo";
import { LedgerRepo } from "./ledger-repo";
import { LedgerService } from "./ledger";
import { PaymentRepo } from "./repo";
import { ReconcileService } from "./reconcile";
import { RefundService } from "./refunds";
import { SettlementService } from "./settlement";
import { WebhookService } from "./webhook";

// Builds the payment services from their parts, so the web process and the worker assemble them
// the same way. Only the worker-safe pieces are used: no cache and no encryption are needed to
// confirm or refund an appointment.

export type PaymentWiring = {
  db: Queryable;
  tx: TxRunner;
  gateway: () => PaymentProvider;
  enqueue: (eventId: number) => Promise<unknown>;
  /** The platform's share of each payment, in hundredths of a percent (0 to 10000). */
  feeBps: () => number;
  /** Asks the worker to draw the invoice for a payment. Left out where nothing is queued. */
  enqueueInvoice?: (paymentId: string) => Promise<unknown>;
};

export function createPaymentServices(w: PaymentWiring) {
  const repo = new PaymentRepo(w.db, w.tx);
  const appointments = new AppointmentService({
    repo: new AppointmentRepo(w.db),
    patients: new PatientRepo(w.db),
    // Confirming a paid appointment does not read slot lists; clearing the cache is best effort.
    slots: {
      list: async () => {
        throw new Error("not used here");
      },
      invalidate: async () => undefined,
    },
    crypto: () => {
      throw new Error("not used here");
    },
  });
  const refunds = new RefundService({ repo, gateway: w.gateway });
  const ledgerRepo = new LedgerRepo(w.db);
  const ledger = new LedgerService({ repo: ledgerRepo, feeBps: w.feeBps });
  const invoiceRepo = new InvoiceRepo(w.db, w.tx);
  const reconcile = new ReconcileService({
    repo: ledgerRepo,
    ledger,
    gateway: w.gateway,
    ...(w.enqueueInvoice
      ? {
          invoices: {
            missing: (limit: number) => invoiceRepo.missingInvoices(limit),
            enqueue: w.enqueueInvoice,
          },
        }
      : {}),
  });
  const settlement = new SettlementService({
    repo,
    gateway: w.gateway,
    confirmAppointment: (id) => appointments.confirmAfterPayment(id, null),
    refunds,
    onCaptured: async (payment) => {
      await ledger.recordCapture(payment);
    },
    onConfirmed: async (payment) => {
      await w.enqueueInvoice?.(payment.id);
    },
  });
  const webhook = new WebhookService({ repo, gateway: w.gateway, settlement, enqueue: w.enqueue });
  return { repo, refunds, settlement, webhook, ledger, ledgerRepo, reconcile };
}
