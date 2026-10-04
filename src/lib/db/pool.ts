import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Config } from "../config/config";
import { registerReadinessCheck } from "../health/checks";
import { registerShutdownHook } from "../lifecycle";
import { logger } from "../logging/logger";
import { globalSingleton } from "../singleton";
import type { Queryable, TxRunner } from "./queryable";

// Database module. One pool per process, sized by DATABASE_POOL_MAX so that
// tasks x pool stays under the database connection limit. The pool connects as
// the `app` role (DML only). Migrations use a separate connection and the
// `migrator` role (db/migrate.mts).
//
// Drizzle is used for typed queries only. The SQL files in db/migrations are the
// source of truth for the schema; drizzle-kit is not used (decision D-018).

export type Database = { pool: pg.Pool; drizzle: NodePgDatabase };

export type PoolSettings = {
  connectionString: string;
  max: number;
  applicationName?: string;
};

export function createPool(settings: PoolSettings): pg.Pool {
  const pool = new pg.Pool({
    connectionString: settings.connectionString,
    max: settings.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    // A slow query is cut off instead of holding a connection and a request.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 30_000,
    application_name: settings.applicationName ?? "vinicure-web",
  });
  // An idle connection can fail (database restart, failover). Log and let the pool replace it.
  pool.on("error", (err) => logger.error({ event: "db_idle_client_error", err }));
  return pool;
}

const holder = globalSingleton("db", () => ({ db: undefined as Database | undefined }));

export function createDatabase(settings: PoolSettings): Database {
  const pool = createPool(settings);
  return { pool, drizzle: drizzle(pool) };
}

/** Opens the process-wide database, registers its readiness check and its shutdown. */
export function configureDatabase(
  config: Pick<Config, "DATABASE_URL" | "DATABASE_POOL_MAX">,
  applicationName = "vinicure-web",
): Database | undefined {
  if (!config.DATABASE_URL) return undefined;
  if (holder.db) return holder.db;
  const db = createDatabase({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    applicationName,
  });
  holder.db = db;
  logger.info({ event: "db_configured", poolMax: config.DATABASE_POOL_MAX });
  registerReadinessCheck("database", async () => void (await db.pool.query("SELECT 1")));
  registerShutdownHook("database", () => closeDatabase());
  return db;
}

export function getDatabase(): Database {
  if (!holder.db) throw new Error("database is not configured");
  return holder.db;
}

export function queryable(db: Database = getDatabase()): Queryable {
  return {
    query: async (text, params) => ({
      rows: (await db.pool.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
}

/** Waits for checked-out connections to be returned, then closes the pool. Safe to call twice. */
export async function closeDatabase(): Promise<void> {
  const db = holder.db;
  if (!db) return;
  holder.db = undefined;
  await db.pool.end();
}

/** Transactions on the process-wide pool: BEGIN, run, COMMIT, or ROLLBACK if anything throws. */
export function txRunner(db: Database = getDatabase()): TxRunner {
  return {
    async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: async (text, params) => ({
            rows: (await client.query(text, params)).rows as Record<string, unknown>[],
          }),
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
