import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadMigrations, migrate } from "../src/db/migrator.mts";

// pnpm db:migrate
// Connects with DATABASE_MIGRATION_URL (the migrator role), applies every pending
// file in db/migrations in order, and exits. The URL is never printed.

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error("DATABASE_MIGRATION_URL is not set");
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");
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
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
