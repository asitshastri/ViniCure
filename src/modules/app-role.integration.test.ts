import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "../lib/ids";
import { DataRequestRepo } from "./compliance/repo";
import { DataRequestService } from "./compliance/service";
import { IdentityRepo } from "./identity/repo";
import { SessionService } from "./identity/sessions";
import { PatientRepo } from "./patients/repo";
import { PatientService } from "./patients/service";

// The in-process tests run migrations as a superuser, so table grants are not exercised there.
// This file runs the P2 services as the real `app` role (no schema rights) on real Postgres.
// Skipped unless DATABASE_TEST_URL is set (see docker/README.md).
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("P2 services as the app role on real Postgres", () => {
  let pool: pg.Pool;
  const run = Date.now();
  const users: string[] = [];
  const q = () => ({
    query: async (text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
    }),
  });

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
  });
  afterAll(async () => {
    await pool.query("DELETE FROM data_requests WHERE user_id = ANY($1)", [users]);
    await pool.query("DELETE FROM patients WHERE account_user_id = ANY($1)", [users]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id = ANY($1)", [users]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [users]);
    await pool.end();
  });

  async function user() {
    const id = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)", [
      id,
      `it-${run}-${id}@no-email.invalid`,
    ]);
    users.push(id);
    return id;
  }

  it("patient profiles: create, list, ownership, cap, soft delete", async () => {
    const service = new PatientService(new PatientRepo(q()));
    const a = { userId: await user(), roles: ["patient" as const] };
    const b = { userId: await user(), roles: ["patient" as const] };
    const me = await service.create(a, {
      relation: "self",
      fullName: "Asha Verma",
      dob: "1990-04-12",
      gender: "female",
    });
    const kid = await service.create(a, {
      relation: "child",
      fullName: "Mira Verma",
      dob: new Date(Date.now() - 6 * 365 * 86400000).toISOString().slice(0, 10),
      gender: "female",
    });
    expect(kid.isMinor).toBe(true);
    expect((await service.list(a)).map((p) => p.id)).toEqual([me.id, kid.id]);
    await expect(service.get(b, me.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.create(a, {
        relation: "self",
        fullName: "Second Self",
        dob: "1991-01-01",
        gender: "female",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await service.remove(a, kid.id);
    expect(await service.list(a)).toHaveLength(1);
  });

  it("data requests: one open request per kind, even when sent together", async () => {
    const service = new DataRequestService(new DataRequestRepo(q()));
    const id = await user();
    const results = await Promise.allSettled([
      service.create(id, "erase"),
      service.create(id, "erase"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await service.list(id)).toHaveLength(1);
  });

  it("sessions: list own, revoke own, others untouched", async () => {
    const service = new SessionService(new IdentityRepo(q()));
    const a = await user();
    const b = await user();
    const mk = async (u: string) => {
      const id = uuidv7();
      await pool.query(
        "INSERT INTO auth_sessions (id, user_id, token, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')",
        [id, u, `tok-${id}`],
      );
      return id;
    };
    const mine = await mk(a);
    const other = await mk(a);
    const theirs = await mk(b);
    expect((await service.list(a, mine)).map((s) => s.id).sort()).toEqual([mine, other].sort());
    await service.revoke(a, mine, other);
    await expect(service.revoke(a, mine, theirs)).rejects.toMatchObject({ code: "not_found" });
    expect(await service.revokeMany(a, mine, "all")).toBe(1);
    expect((await service.list(b, theirs)).length).toBe(1);
  });
});
