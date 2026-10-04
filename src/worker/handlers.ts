import { queryable, getDatabase } from "../lib/db/pool";
import type { Handlers } from "../lib/queue/queue";
import { getFileScanner } from "../lib/adapters/registry";
import { DirectoryRepo } from "../modules/directory/repo";
import { DirectoryService } from "../modules/directory/service";
import { getStorage } from "../lib/storage";
import { AppointmentRepo } from "../modules/scheduling/appointments-repo";
import { createPaymentServices } from "../modules/payments/wiring";
import { txRunner } from "../lib/db/pool";
import { getPaymentProvider } from "../lib/adapters/registry";
import { StepUpRepo } from "../modules/identity/stepup/repo";

// Job handlers, one per queue (backend-architecture.md section 8). Each later task adds its
// own: otp.send and notify.send (P8), file.scan (P4), payment.webhook.process (P5), the PDF
// renderers (P7), export.build and erasure.run (P9). A queue with no handler here is not
// consumed, so its jobs wait safely. Handlers must be idempotent.
function payments() {
  return createPaymentServices({
    db: queryable(getDatabase()),
    tx: txRunner(),
    gateway: getPaymentProvider,
    // The worker re-queues nothing from inside a job; a lost job is found again by the sweep.
    enqueue: async () => undefined,
  });
}

export const handlers: Handlers = {
  // Handles one stored gateway event. A gateway outage throws, so the queue retries it later;
  // an event already handled is skipped.
  "payment.webhook.process": async ({ eventId }, { logger }) => {
    const result = await payments().webhook.process(eventId);
    logger.info({ event: "payment_event_processed", result });
  },
  // Frees unpaid holds that ran out (every minute). A second run changes nothing more, and two
  // workers never take the same row.
  "appointment.release_holds": async (_payload, { logger }) => {
    const repo = new AppointmentRepo(queryable(getDatabase()));
    let released = 0;
    for (let i = 0; i < 20; i++) {
      const freed = await repo.releaseExpiredHolds(200);
      released += freed.length;
      if (freed.length < 200) break;
    }
    logger.info({ event: "holds_released", released });
  },
  // Virus-scans an uploaded file. A scanner outage throws, so the queue retries; the file stays
  // inactive until a scan says clean. Running it twice changes nothing more.
  "file.scan": async ({ fileId }, { logger }) => {
    const directory = new DirectoryService({
      repo: new DirectoryRepo(queryable(getDatabase())),
      storage: getStorage,
      queue: async () => {
        throw new Error("the worker does not enqueue from the scan job");
      },
    });
    const verdict = await directory.scanFile(fileId, getFileScanner());
    logger.info({ event: "file_scanned", verdict });
  },

  // Marks numbers not proven for 180 days as unverified. Running it twice changes nothing more.
  "identity.phone_reverify": async (_payload, { logger }) => {
    const marked = await new StepUpRepo(queryable(getDatabase())).markStalePhonesUnverified();
    logger.info({ event: "phone_reverify", marked });
  },
};
