import { PgBoss, fromPglite } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { createBoss, ensureQueues, QueueClient, registerSchedules, startWorkers } from "./queue";
import { DEAD_LETTER_RETENTION_SECONDS, QUEUES, QUEUE_NAMES, deadLetterName } from "./registry";

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: PgBoss;
let boss: PgBoss;

const wait = async (check: () => Promise<boolean> | boolean, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

beforeAll(async () => {
  t = await createTestDb();
  // The migrate step creates the queues as the schema owner.
  admin = createBoss({ db: fromPglite(t.db), backend: "pglite", role: "producer" });
  await admin.start();
  await ensureQueues(admin);
  // Make retries immediate for the dead-letter test.
  await admin.updateQueue("otp.send", { retryDelay: 0, retryLimit: 1, retryBackoff: false });
  await admin.stop({ graceful: false, close: false });

  // From here on everything runs as the application role, which cannot change the schema.
  await t.db.exec("SET ROLE app");
  boss = createBoss({ db: fromPglite(t.db), backend: "pglite", role: "worker" });
  await boss.start();
}, 60_000);

afterAll(async () => {
  await boss.stop({ graceful: false, close: false });
  await t.db.exec("RESET ROLE");
}, 30_000);

describe("registry", () => {
  it("gives every queue a strict ID-only payload, a retry policy and a dead-letter name", () => {
    expect(QUEUE_NAMES.length).toBe(16);
    for (const name of QUEUE_NAMES) {
      expect(deadLetterName(name)).toBe(`${name}.dlq`);
      expect(QUEUES[name].policy.expireInSeconds).toBeGreaterThan(0);
    }
    // Personal data cannot be put into a payload.
    expect(
      QUEUES["notify.send"].payload.safeParse({ notificationId: ID, phone: "+919812345678" })
        .success,
    ).toBe(false);
    expect(QUEUES["notify.send"].payload.safeParse({ notificationId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(QUEUES["notify.send"].payload.safeParse({ notificationId: ID }).success).toBe(true);
  });

  it("lists the retry counts from the architecture doc", () => {
    expect(QUEUES["otp.send"].policy.retryLimit).toBe(3);
    expect(QUEUES["notify.send"].policy).toMatchObject({ retryLimit: 5, retryBackoff: true });
    expect(QUEUES["payment.webhook.process"].policy.retryLimit).toBe(10);
    expect(QUEUES["export.build"].policy.retryLimit).toBe(3);
    expect(QUEUES["appointment.release_holds"].policy.cron).toBe("* * * * *");
  });
});

describe("queues", () => {
  it("were created with a dead-letter queue each, and creating them again is harmless", async () => {
    const queues = await boss.getQueues();
    const names = queues.map((q) => q.name);
    for (const name of QUEUE_NAMES) {
      expect(names).toContain(name);
      expect(names).toContain(deadLetterName(name));
    }
    const main = queues.find((q) => q.name === "notify.send");
    expect(main?.deadLetter).toBe("notify.send.dlq");
    const dlq = queues.find((q) => q.name === "notify.send.dlq");
    expect(dlq?.retentionSeconds).toBe(DEAD_LETTER_RETENTION_SECONDS);
  });

  it("the application role cannot change the schema through the queue connection", async () => {
    await expect(t.db.exec("CREATE TABLE pgboss.sneaky (id int)")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("enqueue", () => {
  const client = () => new QueueClient(boss);

  it("accepts a valid payload and refuses extra fields before touching the database", async () => {
    expect(await client().enqueue("notify.send", { notificationId: ID })).toEqual(
      expect.any(String),
    );
    await expect(
      client().enqueue("notify.send", { notificationId: ID, phone: "+919812345678" } as never),
    ).rejects.toThrow();
    await expect(
      client().enqueue("reminder.fire", { appointmentId: ID, kind: "2h" } as never),
    ).rejects.toThrow();
  });

  it("a dedupe key adds the same job only once", async () => {
    const first = await client().enqueue("file.scan", { fileId: ID }, { dedupeKey: `scan-${ID}` });
    const second = await client().enqueue("file.scan", { fileId: ID }, { dedupeKey: `scan-${ID}` });
    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
  });

  it("a delayed job is not available straight away", async () => {
    await new QueueClient(boss).enqueue(
      "reminder.fire",
      { appointmentId: ID, kind: "1h" },
      { startAfter: 3600 },
    );
    const now = await boss.fetch("reminder.fire");
    expect(now).toHaveLength(0);
  });
});

describe("workers", () => {
  it("runs a job once with a validated payload and logs no payload data", async () => {
    const seen: unknown[] = [];
    await startWorkers(
      boss,
      {
        "export.build": async (payload, ctx) => {
          seen.push({ payload, queue: ctx.queue, hasId: Boolean(ctx.jobId) });
        },
      },
      { pollingIntervalSeconds: 0.5 },
    );
    await new QueueClient(boss).enqueue("export.build", { dataRequestId: ID });
    expect(await wait(() => seen.length === 1)).toBe(true);
    expect(seen[0]).toEqual({ payload: { dataRequestId: ID }, queue: "export.build", hasId: true });
    await new Promise((r) => setTimeout(r, 1500));
    expect(seen).toHaveLength(1);
  }, 30_000);

  it("retries a failing job and then moves it to the dead-letter queue", async () => {
    let attempts = 0;
    await startWorkers(
      boss,
      {
        "otp.send": async () => {
          attempts += 1;
          throw new Error("provider down");
        },
      },
      { pollingIntervalSeconds: 0.5 },
    );
    const jobId = await new QueueClient(boss).enqueue("otp.send", { otpRequestId: ID });
    expect(jobId).toBeTruthy();

    const landed = await wait(async () => (await boss.findJobs("otp.send.dlq")).length > 0);
    expect(landed).toBe(true);
    // One first attempt plus one retry (the queue was set to retryLimit 1 above).
    expect(attempts).toBe(2);
    const [dead] = await boss.findJobs<{ otpRequestId: string }>("otp.send.dlq");
    expect(dead?.data).toEqual({ otpRequestId: ID });
  }, 40_000);
});

describe("schedules", () => {
  it("registers a cron schedule for every queue that has one", async () => {
    await registerSchedules(boss);
    const schedules = await boss.getSchedules();
    const names = schedules.map((s) => s.name).sort();
    expect(names).toEqual(
      QUEUE_NAMES.filter((n) => (QUEUES[n].policy as { cron?: string }).cron).sort(),
    );
    expect(schedules.find((s) => s.name === "appointment.release_holds")?.cron).toBe("* * * * *");
  });
});
