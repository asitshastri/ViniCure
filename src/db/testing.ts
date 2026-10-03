import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import type { Queryable } from "../lib/db/queryable";
import { loadMigrations, migrate, type SqlRunner } from "./migrator.mts";

// Test helper: a real PostgreSQL engine running inside the test process (PGlite), with the
// project's migrations applied. It covers SQL, roles, grants, triggers and partitions without
// Docker. It has one connection, so concurrency tests belong in the Docker integration suite.

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../db/migrations");

export function pgliteRunner(db: PGlite): SqlRunner {
  return {
    exec: async (sql) => void (await db.exec(sql)),
    query: async (sql, params) => ({
      rows: (await db.query(sql, params)).rows as Record<string, unknown>[],
    }),
  };
}

export async function createTestDb(options: { migrations?: boolean } = {}) {
  const db = new PGlite({ extensions: { btree_gist } });
  const runner = pgliteRunner(db);
  if (options.migrations !== false) await migrate(runner, loadMigrations(MIGRATIONS_DIR));

  /** Runs every statement as the given database role, then switches back. */
  const as = (role: "app" | "migrator"): Queryable => ({
    query: async (text, params) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        return { rows: (await db.query(text, params)).rows as Record<string, unknown>[] };
      } finally {
        await db.exec("RESET ROLE");
      }
    },
  });

  return { db, runner, app: as("app"), migrator: as("migrator") };
}
