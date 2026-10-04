import { getPaymentProvider } from "../../lib/adapters/registry";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable, txRunner } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { getQueue } from "../../lib/queue/producer";
import type { InvoiceService } from "./invoice";
import { createInvoiceServiceFrom } from "./invoice-wiring";
import { PaymentService } from "./service";

export * from "./schemas";
export { PaymentService } from "./service";
export { SettlementService } from "./settlement";
export { WebhookService } from "./webhook";
export { RefundService } from "./refunds";
export { InvoiceService, includedTax, invoiceNumber } from "./invoice";
export { createInvoiceServiceFrom } from "./invoice-wiring";
export { LedgerService, splitPayment } from "./ledger";
export { ReconcileService } from "./reconcile";

import { createPaymentServices } from "./wiring";
import { getStorage } from "../../lib/storage";

export { createPaymentServices } from "./wiring";

const holder = globalSingleton("payments", () => ({
  service: undefined as PaymentService | undefined,
  invoices: undefined as InvoiceService | undefined,
  parts: undefined as ReturnType<typeof createPaymentServices> | undefined,
}));

function parts() {
  holder.parts ??= createPaymentServices({
    db: queryable(getDatabase()),
    tx: txRunner(),
    gateway: getPaymentProvider,
    enqueue: async (eventId) => (await getQueue()).enqueue("payment.webhook.process", { eventId }),
    feeBps: () => getConfig().PLATFORM_FEE_BPS,
    enqueueInvoice: async (paymentId) =>
      (await getQueue()).enqueue("invoice.render_pdf", { paymentId }),
  });
  return holder.parts;
}

export function getPayments(): PaymentService {
  holder.service ??= new PaymentService({
    repo: parts().repo,
    settlement: parts().settlement,
    refunds: parts().refunds,
    gateway: getPaymentProvider,
    publicKeyId: () => getConfig().RAZORPAY_KEY_ID ?? "fake_key_id",
  });
  return holder.service;
}

export const getWebhook = () => parts().webhook;
export function getInvoices(): InvoiceService {
  holder.invoices ??= createInvoiceService();
  return holder.invoices;
}

export const getRefunds = () => parts().refunds;
export const getSettlement = () => parts().settlement;

/** Replaces the service (tests). Pass undefined to reset. */
export function setPaymentsForTest(service: PaymentService | undefined): void {
  holder.service = service;
  holder.parts = undefined;
}

/** Replaces the assembled services (tests). */
export function setPaymentPartsForTest(
  value: ReturnType<typeof createPaymentServices> | undefined,
): void {
  holder.parts = value;
}

/** Builds the invoice service from configuration. */
export function createInvoiceService(): InvoiceService {
  return createInvoiceServiceFrom({
    db: queryable(getDatabase()),
    tx: txRunner(),
    payments: parts().repo,
    storage: getStorage,
    config: getConfig,
  });
}
