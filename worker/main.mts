import { loadConfig } from "../src/lib/config/config";
import { configureDatabase } from "../src/lib/db/pool";
import { logger } from "../src/lib/logging/logger";
import { createBoss } from "../src/lib/queue/queue";
import { handlers } from "../src/worker/handlers";
import { startWorker } from "../src/worker/worker";

// Entry point of the worker container. Built to dist/worker.mjs by `pnpm build:worker`.
// Connects as the `app` database role (DATABASE_URL), never as the migrator.

const config = loadConfig(process.env);
if (!config.DATABASE_URL) {
  logger.error({ event: "worker_config", problem: "DATABASE_URL is required" });
  process.exit(1);
}

// One process-wide pool: the health check, the job handlers and shutdown all use it.
const database = configureDatabase(config, "vinicure-worker");
if (!database) throw new Error("database is not configured");
const pool = database.pool;
const boss = createBoss({ connectionString: config.DATABASE_URL, role: "worker" });

const worker = await startWorker({
  boss,
  handlers,
  checkDatabase: async () => void (await pool.query("SELECT 1")),
  closeDatabase: () => pool.end(),
  healthPort: config.WORKER_HEALTH_PORT,
});

let stopping = false;
const shutdown = (signal: string) => {
  if (stopping) {
    // A second signal means "now".
    logger.warn({ event: "worker_forced_exit", signal });
    process.exit(1);
  }
  stopping = true;
  logger.info({ event: "shutdown", signal });
  worker.stop().then(
    () => process.exit(0),
    (err) => {
      logger.error({ event: "worker_stop_failed", err });
      process.exit(1);
    },
  );
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.fatal({ event: "uncaught_exception", err });
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (err) => {
  logger.fatal({ event: "unhandled_rejection", err });
  shutdown("unhandledRejection");
});
