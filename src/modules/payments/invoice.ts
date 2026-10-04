import type { StorageService } from "../../lib/storage/storage";
import { errors } from "../../lib/errors/app-error";
import { logger } from "../../lib/logging/logger";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import { financialYearOf, renderInvoicePdf, type Seller } from "./invoice-pdf";
import type { InvoiceRepo } from "./invoice-repo";
import type { PaymentRepo } from "./repo";

// Invoices (P5-08): numbered once per financial year, drawn by the worker, kept as a private file
// and handed to the patient as a short-lived link. Tax lines wait for the accountant (TODO.md).

type Deps = {
  repo: InvoiceRepo;
  payments: Pick<PaymentRepo, "findById">;
  storage: () => StorageService;
  /** The tax rate included in the fee, in hundredths of a percent. 0 until it is confirmed. */
  taxBps: () => number;
  seller: () => Seller;
};

export type InvoiceLink =
  { status: "ready"; url: string; expiresAt: string; invoiceNo: string } | { status: "preparing" };

/** Tax included in a price: the part of `amountPaise` that is tax at `bps`, rounded to the nearest paisa. */
export function includedTax(amountPaise: number, bps: number): number {
  if (bps === 0) return 0;
  return amountPaise - Math.round((amountPaise * 10_000) / (10_000 + bps));
}

export const invoiceNumber = (financialYear: string, n: number): string =>
  `VC/${financialYear}/${String(n).padStart(6, "0")}`;

export class InvoiceService {
  constructor(private readonly deps: Deps) {}

  /**
   * The worker's job: issue the invoice if it has not been, draw it, store it, link it. Safe to
   * run again at any point: a repeat finds the invoice, and only the missing steps are done.
   * Returns what happened, for the log.
   */
  async issueAndRender(paymentId: string): Promise<"issued" | "already" | "not_billable"> {
    const { repo } = this.deps;
    const bps = this.deps.taxBps();
    const invoice = await repo.issue({
      id: uuidv7(),
      paymentId,
      financialYearOf,
      taxFor: (amount) => ({ taxPaise: includedTax(amount, bps), taxRateBps: bps }),
      format: invoiceNumber,
    });
    if (!invoice) return "not_billable";
    if (invoice.pdfFileId) return "already";

    const data = await repo.dataFor(invoice.id);
    if (!data) throw new Error("invoice data missing");
    const bytes = await renderInvoicePdf(data, this.deps.seller());
    const stored = await this.deps.storage().storeGenerated({ purpose: "invoice_pdf", bytes });
    const attached = await repo.attachPdf({
      invoiceId: invoice.id,
      fileId: uuidv7(),
      storageKey: stored.storageKey,
      originalName: `invoice-${invoice.invoiceNo.replaceAll("/", "-")}.pdf`,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    });
    if (!attached) {
      // Another run got there first; ours is an unused object. Remove it.
      await this.deps
        .storage()
        .remove("invoice_pdf", stored.storageKey)
        .catch((error: unknown) =>
          logger.warn({ event: "invoice_orphan_cleanup_failed", err: error }),
        );
      return "already";
    }
    logger.info({ event: "invoice_issued" });
    return "issued";
  }

  /** The patient's link to their invoice, or "preparing" while the worker is still drawing it. */
  async linkFor(principal: Principal, paymentId: string): Promise<InvoiceLink> {
    const payment = await this.deps.payments.findById(paymentId);
    // Someone else's payment is the same 404 as one that does not exist.
    if (!payment) throw errors.notFound();
    assertAllowed(can.payment.read(principal, { ownerUserId: payment.payerUserId }));
    const stored = await this.deps.repo.pdfKeyFor(paymentId);
    if (!stored) return { status: "preparing" };
    const link = await this.deps.storage().createDownloadUrl({
      purpose: "invoice_pdf",
      storageKey: stored.storageKey,
      type: "application/pdf",
      fileName: `invoice-${stored.invoiceNo.replaceAll("/", "-")}.pdf`,
    });
    return {
      status: "ready",
      url: link.url,
      expiresAt: link.expiresAt.toISOString(),
      invoiceNo: stored.invoiceNo,
    };
  }
}
