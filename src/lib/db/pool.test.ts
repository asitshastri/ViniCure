import { beforeEach, describe, expect, it } from "vitest";
import { clearReadinessChecksForTest, runReadinessChecks } from "../health/checks";
import {
  installSignalHandlers,
  registerShutdownHook,
  resetLifecycleForTest,
  runShutdownHooks,
} from "../lifecycle";
import { closeDatabase, configureDatabase, createPool, getDatabase } from "./pool";

beforeEach(async () => {
  await closeDatabase();
  clearReadinessChecksForTest();
  resetLifecycleForTest();
});

describe("pool settings", () => {
  it("uses the configured size and safe timeouts", async () => {
    const pool = createPool({ connectionString: "postgres://app@127.0.0.1:1/vinicure", max: 7 });
    const options = pool.options as unknown as Record<string, unknown>;
    expect(options.max).toBe(7);
    expect(options.statement_timeout).toBe(15_000);
    expect(options.connectionTimeoutMillis).toBe(3_000);
    expect(options.application_name).toBe("vinicure-web");
    await pool.end();
  });
});

describe("configureDatabase", () => {
  it("does nothing without DATABASE_URL", () => {
    expect(configureDatabase({ DATABASE_URL: undefined, DATABASE_POOL_MAX: 5 })).toBeUndefined();
    expect(() => getDatabase()).toThrow();
  });

  it("registers a readiness check that fails when the database is unreachable, and closes cleanly", async () => {
    configureDatabase({
      DATABASE_URL: "postgres://app@127.0.0.1:1/vinicure",
      DATABASE_POOL_MAX: 2,
    });
    const report = await runReadinessChecks();
    expect(report).toEqual({ ready: false, checks: { database: "fail" } });
    await closeDatabase();
    await closeDatabase(); // calling twice is safe
    expect(() => getDatabase()).toThrow();
  });

  it("returns the same database on a second call", () => {
    const config = { DATABASE_URL: "postgres://app@127.0.0.1:1/vinicure", DATABASE_POOL_MAX: 2 };
    const first = configureDatabase(config);
    expect(configureDatabase(config)).toBe(first);
  });
});

describe("shutdown hooks", () => {
  it("run once, last registered first, and one failure does not stop the others", async () => {
    const order: string[] = [];
    registerShutdownHook("first", async () => void order.push("first"));
    registerShutdownHook("broken", async () => {
      throw new Error("boom");
    });
    registerShutdownHook("last", async () => void order.push("last"));
    await runShutdownHooks();
    await runShutdownHooks(); // second call is ignored
    expect(order).toEqual(["last", "first"]);
  });

  it("gives up on a hook that never finishes", async () => {
    registerShutdownHook("stuck", () => new Promise(() => {}));
    const started = Date.now();
    await runShutdownHooks(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("installs signal handlers only once", () => {
    const before = process.listenerCount("SIGTERM");
    installSignalHandlers({ exit: false });
    installSignalHandlers({ exit: false });
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });
});
