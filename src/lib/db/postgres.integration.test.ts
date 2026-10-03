import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, configureDatabase, getDatabase } from "./pool";

// Runs against the Postgres in docker/compose.yml. Skipped unless DATABASE_TEST_URL is set:
//   pnpm db:migrate        (with DATABASE_MIGRATION_URL pointing at the same database)
//   DATABASE_TEST_URL=postgres://app:dev-only-change-me@localhost:5432/vinicure pnpm test
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("pool against Postgres", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("connects as the app role, answers a query, and respects the pool size", async () => {
    configureDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 3 });
    const { pool } = getDatabase();
    expect((await pool.query("SELECT 1 AS one")).rows[0]).toEqual({ one: 1 });
    expect((await pool.query("SELECT current_user AS u")).rows[0]).toEqual({ u: "app" });

    // Ten parallel queries share three connections.
    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        pool.query("SELECT pg_sleep(0.05), pg_backend_pid() AS pid"),
      ),
    );
    expect(new Set(rows.map((r) => r.rows[0]?.pid)).size).toBeLessThanOrEqual(3);
  });

  it("cuts off a statement that runs too long", async () => {
    const { pool } = getDatabase();
    await expect(pool.query("SELECT pg_sleep(30)")).rejects.toThrow(/statement timeout/);
  }, 25_000);

  it("the app role cannot run DDL on the real server", async () => {
    const { pool } = getDatabase();
    await expect(pool.query("CREATE TABLE should_not_exist (id int)")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("closes cleanly with no open connections left", async () => {
    const { pool } = getDatabase();
    await closeDatabase();
    expect(pool.totalCount).toBe(0);
    expect(pool.ended).toBe(true);
  });
});
