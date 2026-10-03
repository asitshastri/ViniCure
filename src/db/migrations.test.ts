import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "../lib/audit/audit";
import { PgAuditStore } from "../lib/audit/repo";
import { MemoryCache } from "../lib/cache/cache";
import { Crypto, LocalKeyProvider } from "../lib/crypto/crypto";
import { createIdempotency } from "../lib/idempotency/idempotency";
import { PgDurableStore } from "../lib/idempotency/repo";
import { MigrationError, checksumOf, loadMigrations, migrate } from "./migrator.mts";
import { MIGRATIONS_DIR, createTestDb, pgliteRunner } from "./testing";

const U1 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const P1 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d";
const R1 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

const denied = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow(/permission denied|append-only|must be owner/);

describe("the real migration files", () => {
  it("are numbered without gaps and apply to an empty database; a second run does nothing", async () => {
    const files = loadMigrations(MIGRATIONS_DIR);
    expect(files.length).toBeGreaterThanOrEqual(3);
    const second = await migrate(t.runner, files);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toBe(files.length);
  });

  it("install btree_gist and the shared trigger functions", async () => {
    const ext = await t.db.query("SELECT extname FROM pg_extension WHERE extname = 'btree_gist'");
    expect(ext.rows).toHaveLength(1);
    const fns = await t.db.query(
      "SELECT proname FROM pg_proc WHERE proname IN ('set_updated_at','forbid_change','ensure_audit_partitions')",
    );
    expect(fns.rows).toHaveLength(3);
  });
});

describe("database roles", () => {
  it("app cannot run DDL: create, alter or drop", async () => {
    await denied(t.app.query("CREATE TABLE sneaky (id int)"));
    await denied(t.app.query("ALTER TABLE idempotency_keys ADD COLUMN x int"));
    await denied(t.app.query("DROP TABLE idempotency_keys"));
    await denied(t.app.query("CREATE SCHEMA evil"));
  });

  it("migrator can create tables, and app can then change data in them but not their structure", async () => {
    await t.migrator.query(
      "CREATE TABLE widgets (id int PRIMARY KEY, name text, updated_at timestamptz DEFAULT now())",
    );
    await t.app.query("INSERT INTO widgets VALUES (1, 'a')");
    await t.app.query("UPDATE widgets SET name = 'b' WHERE id = 1");
    expect((await t.app.query("SELECT name FROM widgets")).rows[0]?.name).toBe("b");
    await denied(t.app.query("ALTER TABLE widgets ADD COLUMN z int"));
  });

  it("app cannot read the migration bookkeeping table", async () => {
    await denied(t.app.query("SELECT * FROM schema_migrations"));
  });

  it("set_updated_at moves updated_at forward on update", async () => {
    await t.migrator.query(
      "CREATE TABLE stamped (id int PRIMARY KEY, v int, updated_at timestamptz NOT NULL DEFAULT '2020-01-01')",
    );
    await t.migrator.query(
      "CREATE TRIGGER stamped_set_updated_at BEFORE UPDATE ON stamped FOR EACH ROW EXECUTE FUNCTION set_updated_at()",
    );
    await t.app.query("INSERT INTO stamped (id, v) VALUES (1, 1)");
    await t.app.query("UPDATE stamped SET v = 2 WHERE id = 1");
    const row = (await t.app.query("SELECT updated_at > '2025-01-01' AS fresh FROM stamped"))
      .rows[0];
    expect(row?.fresh).toBe(true);
  });
});

describe("audit tables (append-only)", () => {
  const service = () => new AuditService(new PgAuditStore(t.app));

  it("app can insert and read audit and PHI entries through the services", async () => {
    await service().record({
      actorUserId: U1,
      action: "doctor.approve",
      entityType: "doctor",
      entityId: P1,
      ip: "203.0.113.5",
      metadata: { changed_fields: ["status"], amount_paise: 100 },
    });
    await service().recordPhiAccess({
      actorUserId: U1,
      patientId: P1,
      resourceType: "prescription",
      resourceId: R1,
      purpose: "treatment",
    });
    const audit = (
      await t.app.query("SELECT action, entity_type, metadata, host(ip) AS ip FROM audit_logs")
    ).rows[0];
    expect(audit).toMatchObject({
      action: "doctor.approve",
      entity_type: "doctor",
      ip: "203.0.113.5",
    });
    expect(audit?.metadata).toEqual({ changed_fields: ["status"], amount_paise: 100 });
    expect((await t.app.query("SELECT purpose FROM phi_access_logs")).rows[0]?.purpose).toBe(
      "treatment",
    );
  });

  it("app cannot UPDATE, DELETE or TRUNCATE either log", async () => {
    for (const table of ["audit_logs", "phi_access_logs"]) {
      await denied(
        t.app.query(
          `UPDATE ${table} SET purpose = 'legal'`.replace(
            "purpose",
            table === "audit_logs" ? "action" : "purpose",
          ),
        ),
      );
      await denied(t.app.query(`DELETE FROM ${table}`));
      await denied(t.app.query(`TRUNCATE ${table}`));
    }
  });

  it("app cannot change a monthly partition directly either", async () => {
    const parts = await t.db.query<{ relname: string }>(
      "SELECT relname FROM pg_class WHERE relname LIKE 'audit_logs_20%' AND relkind = 'r' ORDER BY relname",
    );
    expect(parts.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of parts.rows) {
      await denied(t.app.query(`DELETE FROM ${String(row.relname)}`));
      await denied(t.app.query(`UPDATE ${String(row.relname)} SET action = 'x'`));
    }
  });

  it("even the table owner and a superuser are stopped by the trigger", async () => {
    await expect(t.db.exec("UPDATE audit_logs SET action = 'tampered'")).rejects.toThrow(
      /append-only/,
    );
    await expect(t.db.exec("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
    await expect(t.db.exec("TRUNCATE audit_logs")).rejects.toThrow(/append-only/);
    await expect(t.db.exec("UPDATE phi_access_logs SET purpose = 'legal'")).rejects.toThrow(
      /append-only/,
    );
  });

  it("rejects an unknown purpose or resource type at the database level too", async () => {
    await expect(
      t.app.query(
        "INSERT INTO phi_access_logs (actor_user_id, patient_id, resource_type, resource_id, purpose) VALUES ($1,$2,'prescription',$3,'curiosity')",
        [U1, P1, R1],
      ),
    ).rejects.toThrow(/check/i);
  });

  it("routes a row to the right monthly partition and ensure_audit_partitions is repeatable", async () => {
    await t.db.exec("SELECT ensure_audit_partitions(3)");
    await t.db.exec("SELECT ensure_audit_partitions(3)");
    await t.app.query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, occurred_at) VALUES ($1, 'refund.create', 'payment', now())",
      [U1],
    );
    const where = await t.db.query<{ part: string }>(
      "SELECT tableoid::regclass::text AS part FROM audit_logs WHERE action = 'refund.create'",
    );
    expect(String(where.rows[0]?.part)).toMatch(/^audit_logs_\d{4}_\d{2}$/);
  });
});

describe("idempotency table through PgDurableStore", () => {
  const store = () => new PgDurableStore(t.app);
  const rec = (scope: string, hash = "h1") => ({
    scopeHash: scope,
    requestHash: hash,
    state: "in_progress" as const,
    expiresAt: new Date(Date.now() + 60_000),
  });

  it("creates once, refuses a live duplicate, and takes over an expired row", async () => {
    expect(await store().insertIfAbsent(rec("s-1"))).toBe(true);
    expect(await store().insertIfAbsent(rec("s-1"))).toBe(false);
    await t.db.exec(
      "UPDATE idempotency_keys SET expires_at = now() - interval '1 second' WHERE scope_hash = 's-1'",
    );
    expect(await store().get("s-1")).toBeNull();
    expect(await store().insertIfAbsent(rec("s-1", "h2"))).toBe(true);
    expect((await store().get("s-1"))?.requestHash).toBe("h2");
  });

  it("completes, reads back, removes and cleans up expired rows", async () => {
    await store().insertIfAbsent(rec("s-2"));
    await store().complete("s-2", {
      responseStatus: 200,
      responseContentType: "application/json",
      responseBodyEnc: "v1:x",
    });
    expect(await store().get("s-2")).toMatchObject({
      state: "completed",
      responseStatus: 200,
      responseBodyEnc: "v1:x",
    });
    await store().remove("s-2");
    expect(await store().get("s-2")).toBeNull();
    await store().insertIfAbsent(rec("s-3"));
    await t.db.exec(
      "UPDATE idempotency_keys SET expires_at = now() - interval '1 hour' WHERE scope_hash = 's-3'",
    );
    expect(await store().deleteExpired()).toBeGreaterThanOrEqual(1);
  });

  it("works end to end with the idempotency runner: same request replays, changed request is refused", async () => {
    const crypto = new Crypto(new LocalKeyProvider("a-local-development-secret-of-32+chars"));
    const run = createIdempotency({
      cache: new MemoryCache(),
      store: store(),
      crypto,
      env: "test",
    });
    let calls = 0;
    const args = {
      key: "key-12345678",
      actorId: U1,
      route: "/api/v1/appointments/hold",
      requestHash: "same",
      execute: async () => {
        calls += 1;
        return new Response('{"bookingId":"b-1"}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    };
    await run(args);
    const replay = await run(args);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await replay.json()).toEqual({ bookingId: "b-1" });
    expect(calls).toBe(1);
    await expect(run({ ...args, requestHash: "different" })).rejects.toMatchObject({
      code: "idempotency_conflict",
    });
    const stored = await t.db.query<{ response_body_enc: string }>(
      "SELECT response_body_enc FROM idempotency_keys WHERE state = 'completed' ORDER BY created_at DESC LIMIT 1",
    );
    expect(String(stored.rows[0]?.response_body_enc)).toMatch(/^v1:/);
    expect(String(stored.rows[0]?.response_body_enc)).not.toContain("b-1");
  });
});

describe("migration runner rules", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const folder = (files: Record<string, string>) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "vc-mig-"));
    dirs.push(dir);
    for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
    return dir;
  };
  const bare = () => pgliteRunner(new PGlite());

  it("applies in order and records name and checksum", async () => {
    const runner = bare();
    const dir = folder({
      "0001_a.sql": "CREATE TABLE a (id int);",
      "0002_b.sql": "CREATE TABLE b (id int);",
    });
    const result = await migrate(runner, loadMigrations(dir));
    expect(result.applied).toEqual(["0001_a", "0002_b"]);
    const rows = (
      await runner.query("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
    ).rows;
    expect(rows.map((r) => r.name)).toEqual(["a", "b"]);
    expect(rows[0]?.checksum).toBe(checksumOf("CREATE TABLE a (id int);"));
  });

  it("stops when an applied file was edited", async () => {
    const runner = bare();
    const dir = folder({ "0001_a.sql": "CREATE TABLE a (id int);" });
    await migrate(runner, loadMigrations(dir));
    writeFileSync(path.join(dir, "0001_a.sql"), "CREATE TABLE a (id int, extra int);");
    await expect(migrate(runner, loadMigrations(dir))).rejects.toThrow(
      /changed after it was applied/,
    );
  });

  it("stops when an applied file is missing", async () => {
    const runner = bare();
    const dir = folder({ "0001_a.sql": "SELECT 1;", "0002_b.sql": "SELECT 1;" });
    await migrate(runner, loadMigrations(dir));
    rmSync(path.join(dir, "0002_b.sql"));
    await expect(migrate(runner, loadMigrations(dir))).rejects.toThrow(/file is missing/);
  });

  it("refuses gaps, duplicates and badly named files", () => {
    expect(() => loadMigrations(folder({ "0001_a.sql": "", "0003_c.sql": "" }))).toThrow(
      MigrationError,
    );
    expect(() => loadMigrations(folder({ "0001_a.sql": "", "0001_b.sql": "" }))).toThrow(
      MigrationError,
    );
    expect(() => loadMigrations(folder({ "1_a.sql": "" }))).toThrow(/Bad migration file name/);
    expect(() => loadMigrations(folder({ "0001_Bad-Name.sql": "" }))).toThrow(
      /Bad migration file name/,
    );
  });

  it("rolls back a failing migration completely and records nothing", async () => {
    const runner = bare();
    const dir = folder({ "0001_a.sql": "CREATE TABLE ok (id int); INSERT INTO nope VALUES (1);" });
    await expect(migrate(runner, loadMigrations(dir))).rejects.toThrow(/0001_a failed/);
    expect(
      (await runner.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0]?.n,
    ).toBe(0);
    await expect(runner.query("SELECT * FROM ok")).rejects.toThrow();
  });

  it("a failure in a later file keeps the earlier ones", async () => {
    const runner = bare();
    const dir = folder({
      "0001_a.sql": "CREATE TABLE a (id int);",
      "0002_b.sql": "SELECT * FROM missing_table;",
    });
    await expect(migrate(runner, loadMigrations(dir))).rejects.toThrow(/0002_b failed/);
    expect(
      (await runner.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version),
    ).toEqual(["0001"]);
  });

  it("the no-transaction directive is read from the first line", () => {
    const files = loadMigrations(
      folder({ "0001_a.sql": "-- migrate: no-transaction\nSELECT 1;", "0002_b.sql": "SELECT 1;" }),
    );
    expect(files.map((f) => f.transactional)).toEqual([false, true]);
  });

  it("line endings do not change the checksum", () => {
    expect(checksumOf("a\r\nb\r\n")).toBe(checksumOf("a\nb\n"));
  });
});
