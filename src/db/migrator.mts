import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Forward-only SQL migrations (backend-architecture.md section 19).
//
// - Files live in db/migrations and are named 0001_name.sql, 0002_name.sql, ...
//   with no gaps and no duplicates.
// - Each file runs in one transaction, unless its first line is
//   "-- migrate: no-transaction" (for CREATE INDEX CONCURRENTLY and similar).
// - An applied file is never edited: its checksum is stored, and a changed file
//   stops the run. Fix a mistake with a new migration.
// - A Postgres advisory lock stops two deploys from migrating at the same time.
// - Line endings are ignored in the checksum, so Windows and Linux agree.
//
// Expand then contract: add the new column or table in one migration, deploy code
// that uses both, and remove the old one in a later migration.

/** One connection. Multi-statement files go through exec, parameterised statements through query. */
export interface SqlRunner {
  exec(sql: string): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type MigrationFile = {
  version: string;
  name: string;
  sql: string;
  checksum: string;
  transactional: boolean;
};

const FILE_NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const LOCK_ID = 727274; // arbitrary, shared by every ViniCure migrator
const NO_TRANSACTION = /^--\s*migrate:\s*no-transaction\s*$/m;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export function checksumOf(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function loadMigrations(dir: string): MigrationFile[] {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const files: MigrationFile[] = names.map((fileName) => {
    const match = FILE_NAME.exec(fileName);
    if (!match) throw new MigrationError(`Bad migration file name: ${fileName}`);
    const sql = readFileSync(path.join(dir, fileName), "utf8");
    const firstLine = sql.replace(/\r\n/g, "\n").split("\n", 1)[0] ?? "";
    return {
      version: match[1] as string,
      name: match[2] as string,
      sql,
      checksum: checksumOf(sql),
      transactional: !NO_TRANSACTION.test(firstLine),
    };
  });
  files.forEach((file, index) => {
    const expected = String(index + 1).padStart(4, "0");
    if (file.version !== expected) {
      throw new MigrationError(
        `Migration numbers must run ${expected}, ... without gaps or duplicates; found ${file.version}`,
      );
    }
  });
  return files;
}

export async function migrate(
  runner: SqlRunner,
  files: MigrationFile[],
  log: (message: string) => void = () => {},
): Promise<{ applied: string[]; alreadyApplied: number }> {
  await runner.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  await runner.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  try {
    const { rows } = await runner.query(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    );
    const applied = new Map(rows.map((row) => [String(row.version), String(row.checksum)]));

    for (const version of applied.keys()) {
      if (!files.some((file) => file.version === version)) {
        throw new MigrationError(
          `Migration ${version} is recorded as applied but its file is missing`,
        );
      }
    }

    const done: string[] = [];
    for (const file of files) {
      const recorded = applied.get(file.version);
      if (recorded !== undefined) {
        if (recorded !== file.checksum) {
          throw new MigrationError(
            `Migration ${file.version}_${file.name} was changed after it was applied. Add a new migration instead.`,
          );
        }
        continue;
      }
      log(`applying ${file.version}_${file.name}`);
      try {
        if (file.transactional) await runner.exec("BEGIN");
        await runner.exec(file.sql);
        await runner.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [file.version, file.name, file.checksum],
        );
        if (file.transactional) await runner.exec("COMMIT");
      } catch (error) {
        if (file.transactional) await runner.exec("ROLLBACK").catch(() => {});
        throw new MigrationError(
          `Migration ${file.version}_${file.name} failed: ${(error as Error).message}`,
        );
      }
      done.push(`${file.version}_${file.name}`);
    }
    return { applied: done, alreadyApplied: applied.size };
  } finally {
    await runner.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
  }
}
