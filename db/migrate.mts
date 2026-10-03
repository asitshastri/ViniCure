import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createBoss, ensureQueues } from "../src/lib/queue/queue";
import { loadMigrations, migrate } from "../src/db/migrator.mts";

// pnpm db:migrate  (builds this file to dist/migrate.mjs, then runs it)
// Connects with DATABASE_MIGRATION_URL (the migrator role), applies every pending file in
// db/migrations in order, creates the job queues, and exits. The URL is never printed.

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error("DATABASE_MIGRATION_URL is not set");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
// Source checkout: db/migrations next to this file. Container: ./migrations next to the bundle.
const dir = [
  process.env.MIGRATIONS_DIR,
  path.resolve(here, "migrations"),
  path.resolve(here, "../db/migrations"),
].find((candidate) => candidate && existsSync(candidate));
if (!dir) {
  console.error("migrations folder not found");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  const runner = {
    exec: async (sql: string) => void (await client.query(sql)),
    query: async (sql: string, params?: unknown[]) => ({
      rows: (await client.query(sql, params)).rows as Record<string, unknown>[],
    }),
  };
  const result = await migrate(runner, loadMigrations(dir), (message) => console.log(message));
  console.log(
    result.applied.length === 0
      ? `database is up to date (${result.alreadyApplied} applied)`
      : `applied ${result.applied.length} migration(s)`,
  );

  // Queues are created here, with the migrator role, so the running app needs no DDL rights.
  const boss = createBoss({ connectionString: url, role: "producer", poolMax: 1 });
  await boss.start();
  try {
    await ensureQueues(boss);
    console.log("job queues are ready");
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
