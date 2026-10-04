import type { Config } from "../../lib/config/config";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import type { StorageService } from "../../lib/storage/storage";
import { InvoiceService } from "./invoice";
import { InvoiceRepo } from "./invoice-repo";
import type { PaymentRepo } from "./repo";

// Builds the invoice service from its parts, so the web process and the worker assemble it the
// same way.

export function createInvoiceServiceFrom(w: {
  db: Queryable;
  tx: TxRunner;
  payments: Pick<PaymentRepo, "findById">;
  storage: () => StorageService;
  config: () => Pick<
    Config,
    "INVOICE_TAX_BPS" | "INVOICE_SELLER_NAME" | "INVOICE_SELLER_ADDRESS" | "INVOICE_SELLER_TAX_ID"
  >;
}): InvoiceService {
  return new InvoiceService({
    repo: new InvoiceRepo(w.db, w.tx),
    payments: w.payments,
    storage: w.storage,
    taxBps: () => w.config().INVOICE_TAX_BPS,
    seller: () => {
      const c = w.config();
      return {
        ...(c.INVOICE_SELLER_NAME ? { name: c.INVOICE_SELLER_NAME } : {}),
        ...(c.INVOICE_SELLER_ADDRESS ? { address: c.INVOICE_SELLER_ADDRESS } : {}),
        ...(c.INVOICE_SELLER_TAX_ID ? { taxId: c.INVOICE_SELLER_TAX_ID } : {}),
      };
    },
  });
}
