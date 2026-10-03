import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { PgBoss, fromPglite, getConstructionPlans } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, createTestDb } from "../db/testing";
import { createBoss, ensureQueues, QueueClient } from "../lib/queue/queue";
import { startWorker, type WorkerHandle } from "./worker";

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

let t: Awaited<ReturnType<typeof createTestDb>>;
let boss: PgBoss;
let worker: WorkerHandle;
let databaseUp = true;
let dbClosed = false;
const started: string[] = [];
const finished: string[] = [];

const wait = async (check: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

beforeAll(async () => {
  t = await createTestDb();
  const admin = createBoss({ db: fromPglite(t.db), backend: "pglite", role: "producer" });
  await admin.start();
  await ensureQueues(admin);
  await admin.stop({ graceful: false, close: false });
  await t.db.exec("SET ROLE app");

  boss = createBoss({ db: fromPglite(t.db), backend: "pglite", role: "worker" });
  worker = await startWorker({
    boss,
    handlers: {
      "export.build": async () => {
        started.push("export");
        await new Promise((r) => setTimeout(r, 1200));
        finished.push("export");
      },
    },
    checkDatabase: async () => {
      if (!databaseUp) throw new Error("password authentication failed for user app at 10.0.0.5");
    },
    closeDatabase: async () => {
      dbClosed = true;
    },
    healthPort: 0,
    gracefulSeconds: 10,
    pollingIntervalSeconds: 0.5,
  });
}, 60_000);

afterAll(async () => {
  await worker.stop();
  await t.db.exec("RESET ROLE");
});

const get = async (p: string, init?: RequestInit) =>
  fetch(`http://127.0.0.1:${worker.healthPort}${p}`, init);

describe("health probes", () => {
  it("/health says ok and /ready says ready while the database answers", async () => {
    expect(await (await get("/health")).json()).toEqual({ status: "ok" });
    const ready = await get("/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
  });

  it("/ready fails without leaking the database error", async () => {
    databaseUp = false;
    const res = await get("/ready");
    const text = await res.text();
    databaseUp = true;
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: "not_ready" });
    expect(text).not.toContain("10.0.0.5");
  });

  it("answers 404 for other paths and 405 for other methods", async () => {
    expect((await get("/admin")).status).toBe(404);
    expect((await get("/health", { method: "POST" })).status).toBe(405);
  });
});

describe("graceful shutdown", () => {
  it("lets a running job finish, then closes the database and the health port; stopping twice is safe", async () => {
    await new QueueClient(boss).enqueue("export.build", { dataRequestId: ID });
    expect(await wait(() => started.length === 1)).toBe(true);
    expect(finished).toHaveLength(0);

    const first = worker.stop();
    // While draining, the platform is told to stop sending traffic and to wait.
    expect(finished).toHaveLength(0);
    const second = worker.stop();
    expect(second).toBe(first);
    await first;

    expect(finished).toEqual(["export"]);
    expect(dbClosed).toBe(true);
    await expect(get("/health")).rejects.toThrow();
  }, 40_000);
});

describe("build and schema drift", () => {
  it("the worker entry bundles with esbuild", async () => {
    const result = await build({
      entryPoints: [path.resolve(import.meta.dirname, "../../worker/main.mts")],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      packages: "external",
      logLevel: "silent",
    });
    expect(result.outputFiles[0]?.text).toContain("startWorker");
  });

  it("the migrate entry bundles with esbuild", async () => {
    const result = await build({
      entryPoints: [path.resolve(import.meta.dirname, "../../db/migrate.mts")],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      packages: "external",
      logLevel: "silent",
    });
    expect(result.outputFiles[0]?.text).toContain("ensureQueues");
  });

  it("migration 0004 is exactly the pg-boss schema of the installed version", () => {
    const file = readFileSync(path.join(MIGRATIONS_DIR, "0004_queue_pgboss.sql"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const header = file.split("\n").slice(0, 4).join("\n") + "\n";
    expect(file.slice(header.length)).toBe(getConstructionPlans("pgboss"));
  });
});
