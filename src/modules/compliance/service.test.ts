import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { createDataRequestBody } from "./index";
import { DataRequestRepo } from "./repo";
import { DataRequestService } from "./service";

let q: Queryable;
let service: DataRequestService;
let shared: ReturnType<typeof createTestDb> | undefined;

beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (text, params) => ({
      rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  service = new DataRequestService(new DataRequestRepo(q));
}, 60_000);

beforeEach(async () => {
  await q.query(`DELETE FROM data_requests`);
  await q.query(`DELETE FROM users`);
});

async function user() {
  const id = uuidv7();
  await q.query(`INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)`, [
    id,
    `${id}@x.invalid`,
  ]);
  return id;
}

describe("data requests", () => {
  it("records a pending erase request with no deadline guessed", async () => {
    const a = await user();
    const view = await service.create(a, "erase");
    expect(view).toMatchObject({ type: "erase", status: "pending", completedAt: null });
    const row = (
      await q.query(`SELECT user_id, due_at, handled_by FROM data_requests WHERE id = $1`, [
        view.id,
      ])
    ).rows[0];
    expect(row).toMatchObject({ user_id: a, due_at: null, handled_by: null });
    expect(Object.keys(view).sort()).toEqual(["completedAt", "createdAt", "id", "status", "type"]);
  });

  it("refuses a second open request of the same kind, allows another kind", async () => {
    const a = await user();
    await service.create(a, "erase");
    await expect(service.create(a, "erase")).rejects.toMatchObject({ code: "conflict" });
    await expect(service.create(a, "export")).resolves.toBeTruthy();
  });

  it("two simultaneous requests make one row", async () => {
    const a = await user();
    const results = await Promise.allSettled([
      service.create(a, "erase"),
      service.create(a, "erase"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await q.query(`SELECT count(*)::int AS n FROM data_requests`)).rows[0]?.n).toBe(1);
  });

  it("a finished request does not block a new one", async () => {
    const a = await user();
    const first = await service.create(a, "export");
    await q.query(
      `UPDATE data_requests SET status = 'completed', completed_at = now() WHERE id = $1`,
      [first.id],
    );
    await expect(service.create(a, "export")).resolves.toBeTruthy();
    expect(await service.list(a)).toHaveLength(2);
  });

  it("lists only the person's own requests", async () => {
    const a = await user();
    const b = await user();
    await service.create(a, "erase");
    await service.create(b, "export");
    expect((await service.list(a)).map((r) => r.type)).toEqual(["erase"]);
  });

  it("the database refuses an inconsistent finished state", async () => {
    const a = await user();
    await expect(
      q.query(
        `INSERT INTO data_requests (id, user_id, type, status) VALUES ($1, $2, 'erase', 'completed')`,
        [uuidv7(), a],
      ),
    ).rejects.toThrow();
  });

  it("the body accepts export and erase only, and nothing else", () => {
    expect(createDataRequestBody.safeParse({ type: "erase" }).success).toBe(true);
    for (const bad of [
      {},
      { type: "correct" },
      { type: "delete" },
      { type: "erase", userId: "x" },
      { type: "erase", status: "completed" },
    ]) {
      expect(createDataRequestBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
