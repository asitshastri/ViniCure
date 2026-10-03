import { z } from "zod";

// Queue registry (backend-architecture.md section 8). Every queue is listed here with its
// payload shape, retry policy and dead-letter queue. Payloads carry IDs only: no names,
// phone numbers, notes or any other personal data. The job reads what it needs from the
// database, so nothing sensitive sits in the queue tables or in logs.

const id = z.uuid();

export type QueuePolicy = {
  /** Extra attempts after the first. */
  retryLimit: number;
  /** Seconds before the first retry. */
  retryDelay: number;
  /** Doubles the delay on each retry. */
  retryBackoff: boolean;
  /** A running job that takes longer than this is failed and retried. */
  expireInSeconds: number;
  /** Cron expression (UTC) for scheduled queues. */
  cron?: string;
};

export const QUEUES = {
  "otp.send": {
    payload: z.strictObject({ otpRequestId: id }),
    policy: { retryLimit: 3, retryDelay: 2, retryBackoff: false, expireInSeconds: 60 },
  },
  "notify.send": {
    payload: z.strictObject({ notificationId: id }),
    policy: { retryLimit: 5, retryDelay: 10, retryBackoff: true, expireInSeconds: 120 },
  },
  "reminder.fire": {
    payload: z.strictObject({ appointmentId: id, kind: z.enum(["24h", "1h"]) }),
    policy: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 120 },
  },
  "appointment.release_holds": {
    payload: z.strictObject({}),
    policy: {
      retryLimit: 0,
      retryDelay: 0,
      retryBackoff: false,
      expireInSeconds: 120,
      cron: "* * * * *",
    },
  },
  "payment.webhook.process": {
    payload: z.strictObject({ eventId: id }),
    policy: { retryLimit: 10, retryDelay: 15, retryBackoff: true, expireInSeconds: 120 },
  },
  "payment.reconcile": {
    payload: z.strictObject({}),
    policy: {
      retryLimit: 3,
      retryDelay: 300,
      retryBackoff: true,
      expireInSeconds: 1800,
      cron: "30 2 * * *",
    },
  },
  "file.scan": {
    payload: z.strictObject({ fileId: id }),
    policy: { retryLimit: 5, retryDelay: 15, retryBackoff: true, expireInSeconds: 300 },
  },
  "prescription.render_pdf": {
    payload: z.strictObject({ prescriptionId: id }),
    policy: { retryLimit: 5, retryDelay: 15, retryBackoff: true, expireInSeconds: 300 },
  },
  "invoice.render_pdf": {
    payload: z.strictObject({ paymentId: id }),
    policy: { retryLimit: 5, retryDelay: 15, retryBackoff: true, expireInSeconds: 300 },
  },
  "export.build": {
    payload: z.strictObject({ dataRequestId: id }),
    policy: { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 3600 },
  },
  "erasure.run": {
    payload: z.strictObject({ dataRequestId: id }),
    policy: { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 3600 },
  },
  "retention.purge": {
    payload: z.strictObject({}),
    policy: {
      retryLimit: 3,
      retryDelay: 300,
      retryBackoff: true,
      expireInSeconds: 3600,
      cron: "0 3 * * *",
    },
  },
  "audit.partition": {
    payload: z.strictObject({}),
    policy: {
      retryLimit: 3,
      retryDelay: 300,
      retryBackoff: true,
      expireInSeconds: 600,
      cron: "0 1 1 * *",
    },
  },
  "crypto.reencrypt": {
    payload: z.strictObject({
      fromKeyId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/),
      batchSize: z.number().int().min(1).max(5000).optional(),
    }),
    policy: { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 3600 },
  },
} as const satisfies Record<string, { payload: z.ZodType; policy: QueuePolicy }>;

export type QueueName = keyof typeof QUEUES;
export type PayloadOf<Q extends QueueName> = z.output<(typeof QUEUES)[Q]["payload"]>;

export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

/** Every queue has a dead-letter queue. A job lands there after its last retry fails. */
export const deadLetterName = (name: QueueName): string => `${name}.dlq`;

export const DEAD_LETTER_RETENTION_SECONDS = 14 * 24 * 60 * 60;
export const JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;
/** Depth that raises a warning event for a queue. */
export const WARNING_QUEUE_SIZE = 1000;
