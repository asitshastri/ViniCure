import { createHash } from "node:crypto";
import { PgBoss, type ConstructorOptions } from "pg-boss";
import type { Logger } from "pino";
import { logger as defaultLogger } from "../logging/logger";
import {
  DEAD_LETTER_RETENTION_SECONDS,
  JOB_RETENTION_SECONDS,
  QUEUES,
  QUEUE_NAMES,
  WARNING_QUEUE_SIZE,
  deadLetterName,
  type PayloadOf,
  type QueueName,
  type QueuePolicy,
} from "./registry";

// Queue module (pg-boss on the same Postgres, schema `pgboss`).
// - Web and worker enqueue. Only the worker consumes.
// - The schema comes from db/migrations (0004, 0005). pg-boss never changes the schema at
//   run time: migrate and createSchema are off, so the app role needs no DDL rights.
// - Queues and their dead-letter queues are created by ensureQueues(), run by the migrate
//   step with the migrator role.

export type QueueRole = "producer" | "worker";

export type BossSettings = Pick<ConstructorOptions, "db" | "backend"> & {
  connectionString?: string;
  role: QueueRole;
  /** Connections used by pg-boss itself. */
  poolMax?: number;
  applicationName?: string;
};

export function createBoss(settings: BossSettings): PgBoss {
  const worker = settings.role === "worker";
  const options = {
    ...(settings.db ? { db: settings.db } : { connectionString: settings.connectionString }),
    ...(settings.backend ? { backend: settings.backend } : {}),
    schema: "pgboss",
    migrate: false,
    createSchema: false,
    // Only the worker runs maintenance (expiring, archiving, deleting old jobs) and cron.
    supervise: worker,
    schedule: worker,
    reindex: false,
    max: settings.poolMax ?? (worker ? 5 : 2),
    application_name: settings.applicationName ?? `vinicure-${settings.role}`,
  } as ConstructorOptions;
  return new PgBoss(options);
}

function queueOptions(policy: QueuePolicy, dlq: string) {
  return {
    policy: "standard" as const,
    retryLimit: policy.retryLimit,
    retryDelay: policy.retryDelay,
    retryBackoff: policy.retryBackoff,
    expireInSeconds: policy.expireInSeconds,
    retentionSeconds: JOB_RETENTION_SECONDS,
    deleteAfterSeconds: JOB_RETENTION_SECONDS,
    deadLetter: dlq,
    warningQueueSize: WARNING_QUEUE_SIZE,
  };
}

/** Creates every queue and its dead-letter queue if missing. Safe to run on every deploy. */
export async function ensureQueues(
  boss: PgBoss,
  registry: Record<string, { policy: QueuePolicy }> = QUEUES,
): Promise<void> {
  for (const name of Object.keys(registry)) {
    const dlq = deadLetterName(name as QueueName);
    // The dead-letter queue must exist before the queue that points at it.
    await boss.createQueue(dlq, {
      retentionSeconds: DEAD_LETTER_RETENTION_SECONDS,
      deleteAfterSeconds: DEAD_LETTER_RETENTION_SECONDS,
      warningQueueSize: 1,
    });
    await boss.createQueue(
      name,
      queueOptions((registry[name] as { policy: QueuePolicy }).policy, dlq),
    );
  }
}

export type EnqueueOptions = {
  /**
   * "Do this once": a second enqueue with the same key (while the first job is still kept,
   * 7 days) adds nothing and returns null. Built on a job ID derived from queue and key.
   */
  dedupeKey?: string;
  /** Seconds, or a date, before the job may run. */
  startAfter?: number | Date;
  priority?: number;
};

/** A stable UUID for (queue, key), so the same request always maps to the same job. */
export function jobIdFor(queue: string, key: string): string {
  const hex = createHash("sha256")
    .update(
      `${queue}
${key}`,
    )
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5"; // version 5 style
  hex[16] = "89ab"[parseInt(hex[16] as string, 16) % 4] as string;
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class QueueClient {
  constructor(private readonly boss: PgBoss) {}

  /**
   * Adds a job. The payload is checked against the queue's strict schema, so nothing but the
   * listed IDs can be enqueued. Returns the job ID, or null if a singleton job already waits.
   */
  async enqueue<Q extends QueueName>(
    name: Q,
    payload: PayloadOf<Q>,
    options: EnqueueOptions = {},
  ): Promise<string | null> {
    const parsed = QUEUES[name].payload.parse(payload) as object;
    const { dedupeKey, ...rest } = options;
    return this.boss.send(name, parsed, {
      ...rest,
      ...(dedupeKey ? { id: jobIdFor(name, dedupeKey) } : {}),
    });
  }
}

export type JobContext = { jobId: string; queue: QueueName; logger: Logger };
export type JobHandler<Q extends QueueName> = (
  payload: PayloadOf<Q>,
  context: JobContext,
) => Promise<void>;
export type Handlers = { [Q in QueueName]?: JobHandler<Q> };

export type WorkerOptions = {
  /** Seconds between polls. Default 2. */
  pollingIntervalSeconds?: number;
  logger?: Logger;
};

/**
 * Starts consuming. Each handler gets a validated payload. A thrown error fails the attempt: the
 * job is retried by the queue's policy and moves to the dead-letter queue after the last retry.
 * Handlers must be idempotent, because a job can run more than once.
 */
export async function startWorkers(
  boss: PgBoss,
  handlers: Handlers,
  options: WorkerOptions = {},
): Promise<void> {
  const logger = options.logger ?? defaultLogger;
  for (const name of QUEUE_NAMES) {
    const handler = handlers[name] as JobHandler<QueueName> | undefined;
    if (!handler) continue;
    await boss.work<object>(
      name,
      { pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2, batchSize: 1 },
      async (jobs) => {
        for (const job of jobs) {
          const jobLogger = logger.child({ queue: name, jobId: job.id });
          const started = performance.now();
          const parsed = QUEUES[name].payload.safeParse(job.data);
          if (!parsed.success) {
            // A malformed payload can never succeed. Fail it so it reaches the dead-letter queue.
            jobLogger.error({ event: "job_invalid_payload" });
            throw new Error(`invalid payload for ${name}`);
          }
          try {
            await handler(parsed.data as never, { jobId: job.id, queue: name, logger: jobLogger });
            jobLogger.info({
              event: "job_done",
              durationMs: Math.round(performance.now() - started),
            });
          } catch (err) {
            // The error is logged; the job's data never is.
            jobLogger.error({
              event: "job_failed",
              err,
              durationMs: Math.round(performance.now() - started),
            });
            throw err;
          }
        }
      },
    );
  }
}

/** Registers the cron schedules for queues that have one. Run by the worker at start-up. */
export async function registerSchedules(boss: PgBoss): Promise<void> {
  for (const name of QUEUE_NAMES) {
    const cron = (QUEUES[name].policy as QueuePolicy).cron;
    if (cron) await boss.schedule(name, cron, {}, { tz: "UTC" });
  }
}
