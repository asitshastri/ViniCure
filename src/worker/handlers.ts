import { queryable, getDatabase } from "../lib/db/pool";
import type { Handlers } from "../lib/queue/queue";
import { StepUpRepo } from "../modules/identity/stepup/repo";

// Job handlers, one per queue (backend-architecture.md section 8). Each later task adds its
// own: otp.send and notify.send (P8), file.scan (P4), payment.webhook.process (P5), the PDF
// renderers (P7), export.build and erasure.run (P9). A queue with no handler here is not
// consumed, so its jobs wait safely. Handlers must be idempotent.
export const handlers: Handlers = {
  // Marks numbers not proven for 180 days as unverified. Running it twice changes nothing more.
  "identity.phone_reverify": async (_payload, { logger }) => {
    const marked = await new StepUpRepo(queryable(getDatabase())).markStalePhonesUnverified();
    logger.info({ event: "phone_reverify", marked });
  },
};
