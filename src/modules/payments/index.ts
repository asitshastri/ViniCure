import { getPaymentProvider } from "../../lib/adapters/registry";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable, txRunner } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { PaymentRepo } from "./repo";
import { PaymentService } from "./service";

export * from "./schemas";
export { PaymentService } from "./service";

const holder = globalSingleton("payments", () => ({
  service: undefined as PaymentService | undefined,
}));

export function getPayments(): PaymentService {
  holder.service ??= new PaymentService({
    repo: new PaymentRepo(queryable(getDatabase()), txRunner()),
    gateway: getPaymentProvider,
    publicKeyId: () => getConfig().RAZORPAY_KEY_ID ?? "fake_key_id",
  });
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setPaymentsForTest(service: PaymentService | undefined): void {
  holder.service = service;
}
