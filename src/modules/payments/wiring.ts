import type { PaymentProvider } from "../../lib/adapters/types";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppointmentService } from "../scheduling/appointments";
import { AppointmentRepo } from "../scheduling/appointments-repo";
import { PatientRepo } from "../patients/repo";
import { PaymentRepo } from "./repo";
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
  const settlement = new SettlementService({
    repo,
    gateway: w.gateway,
    confirmAppointment: (id) => appointments.confirmAfterPayment(id, null),
    refunds,
  });
  const webhook = new WebhookService({ repo, gateway: w.gateway, settlement, enqueue: w.enqueue });
  return { repo, refunds, settlement, webhook };
}
