import { createServer, type Server } from "node:http";
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import { logger as defaultLogger } from "../lib/logging/logger";
import { registerSchedules, startWorkers, type Handlers } from "../lib/queue/queue";

// The background worker process (backend-architecture.md section 8). It consumes the queues,
// runs the cron schedules, and answers two health probes for the container platform:
//   GET /health  the process is alive
//   GET /ready   the database answers and the worker is not shutting down
// Probes report only ok or fail. They never return error text.

export type WorkerDeps = {
  boss: PgBoss;
  handlers: Handlers;
  /** A cheap read-only check of the database, for /ready. */
  checkDatabase: () => Promise<void>;
  /** Closes the database pool after the queue has stopped. */
  closeDatabase: () => Promise<void>;
  healthPort: number;
  /** Seconds to let running jobs finish when stopping. Default 30. */
  gracefulSeconds?: number;
  pollingIntervalSeconds?: number;
  logger?: Logger;
};

export type WorkerHandle = {
  healthPort: number;
  /** Stops taking jobs, waits for running ones, closes connections. Safe to call twice. */
  stop(): Promise<void>;
};

export async function startWorker(deps: WorkerDeps): Promise<WorkerHandle> {
  const logger = deps.logger ?? defaultLogger;
  let draining = false;
  let stopped: Promise<void> | undefined;

  deps.boss.on("error", (err) => logger.error({ event: "queue_error", err }));
  deps.boss.on("warning", (warning) =>
    // Queue depth and similar alerts. Hooked to metrics in P11.
    logger.warn({ event: "queue_warning", warning: (warning as { type?: string }).type }),
  );

  await deps.boss.start();
  await startWorkers(deps.boss, deps.handlers, {
    pollingIntervalSeconds: deps.pollingIntervalSeconds,
    logger,
  });
  await registerSchedules(deps.boss);

  const server: Server = createServer((req, res) => {
    const send = (status: number, body: object) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") return send(405, { status: "fail" });
    if (req.url === "/health") return send(200, { status: "ok" });
    if (req.url === "/ready") {
      if (draining) return send(503, { status: "draining" });
      deps
        .checkDatabase()
        .then(() => send(200, { status: "ready" }))
        .catch(() => send(503, { status: "not_ready" }));
      return;
    }
    send(404, { status: "fail" });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(deps.healthPort, "0.0.0.0", resolve);
  });
  const address = server.address();
  const healthPort = typeof address === "object" && address ? address.port : deps.healthPort;
  logger.info({ event: "worker_started", healthPort });

  const stop = async () => {
    draining = true;
    logger.info({ event: "worker_stopping" });
    // Waits for running jobs (up to the limit), then closes the queue's own connections.
    await deps.boss.stop({
      graceful: true,
      timeout: (deps.gracefulSeconds ?? 30) * 1000,
      close: true,
    });
    await deps.closeDatabase();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    logger.info({ event: "worker_stopped" });
  };

  return {
    healthPort,
    stop: () => (stopped ??= stop()),
  };
}
