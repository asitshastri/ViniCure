import { getQueue } from "../lib/queue/producer";
import { getConfig } from "../lib/config/config";
import { queryable, getDatabase } from "../lib/db/pool";
import type { Handlers } from "../lib/queue/queue";
import { getFileScanner, getPaymentProvider, getVideoProvider } from "../lib/adapters/registry";
import { DirectoryRepo } from "../modules/directory/repo";
import { DirectoryService } from "../modules/directory/service";
import { getStorage } from "../lib/storage";
import { AppointmentRepo } from "../modules/scheduling/appointments-repo";
import { createInvoiceServiceFrom } from "../modules/payments/invoice-wiring";
import { PaymentRepo } from "../modules/payments/repo";
import { createPaymentServices } from "../modules/payments/wiring";
import { txRunner } from "../lib/db/pool";
import { RecordingRepo } from "../modules/consultations/recording-repo";
import { RecordingService } from "../modules/consultations/recording";
import { isEnabled } from "../lib/config/flags";
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
    feeBps: () => getConfig().PLATFORM_FEE_BPS,
    // A payment settled by the worker (webhook) asks for its invoice the same way the web does.
    enqueueInvoice: async (paymentId) =>
      (await getQueue()).enqueue("invoice.render_pdf", { paymentId }),
  });
}

// The recording service as the worker uses it: it only checks files and cleans up. It never
// starts a recording. The daily sweep re-queues a lost file job the same way the web does.
function recordings() {
  return new RecordingService({
    repo: new RecordingRepo(queryable(getDatabase()), txRunner()),
    video: getVideoProvider,
    enabled: () => isEnabled("recording"),
    retentionDays: () => getConfig().RECORDING_RETENTION_DAYS,
    newKey: () => {
      throw new Error("the worker does not start recordings");
    },
    bucket: () => getConfig().S3_BUCKET_RECORDINGS ?? "",
    enqueueStore: async (recordingId) => {
      await (await getQueue()).enqueue("recording.store", { recordingId });
    },
    storage: getStorage,
  });
}

export const handlers: Handlers = {
  // Checks one stopped recording's file and registers it (P6-08). A file that has not arrived
  // yet throws, so the queue retries; a file that is not a real mp4 is deleted.
  "recording.store": async ({ recordingId }, { logger }) => {
    const result = await recordings().finalize(recordingId);
    logger.info({ event: "recording_store_done", result });
  },
  // Daily: deletes recordings past their retention date, re-queues lost file jobs and fails
  // recordings that were never stopped (P6-08). Expired exports are P9's.
  "retention.purge": async (_payload, { logger }) => {
    const report = await recordings().sweep();
    logger.info({ event: "retention_purge_done", ...report });
  },
  // Handles one stored gateway event. A gateway outage throws, so the queue retries it later;
  // an event already handled is skipped.
  "payment.webhook.process": async ({ eventId }, { logger }) => {
    const result = await payments().webhook.process(eventId);
    logger.info({ event: "payment_event_processed", result });
  },
  // Draws a payment's invoice (P5-08). Safe to run again: it issues once and finishes only the
  // missing steps. A storage outage throws, so the queue retries.
  "invoice.render_pdf": async ({ paymentId }, { logger }) => {
    const db = queryable(getDatabase());
    const invoices = createInvoiceServiceFrom({
      db,
      tx: txRunner(),
      payments: new PaymentRepo(db, txRunner()),
      storage: getStorage,
      config: getConfig,
    });
    const result = await invoices.issueAndRender(paymentId);
    logger.info({ event: "invoice_job_done", result });
  },
  // Daily check of our books against the gateway (P5-06). Repairs missing ledger entries and
  // raises one alert line for anything else; it never moves money.
  "payment.reconcile": async (_payload, { logger }) => {
    const report = await payments().reconcile.run();
    logger.info({ event: "payment_reconcile_done", ...report });
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
