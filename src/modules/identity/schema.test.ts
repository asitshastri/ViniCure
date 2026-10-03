import { getAuthTables } from "better-auth/db";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { twoFactor } from "better-auth/plugins/two-factor";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { uuidv7 } from "../../lib/ids";
import { identityModels, phoneNumberSchema, twoFactorSchema } from "./schema";

// Drift guard: whatever Better Auth wants to read or write must exist in our tables. When
// Better Auth is upgraded and adds a column, this test fails until a migration adds it.

const tables = getAuthTables({
  ...identityModels,
  plugins: [
    phoneNumber({ sendOTP: async () => {}, schema: phoneNumberSchema }),
    twoFactor({ schema: twoFactorSchema }),
  ],
  advanced: { database: { generateId: () => uuidv7() } },
});

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

describe("Better Auth tables match the migration", () => {
  it("uses our table names", () => {
    expect(
      Object.values(tables)
        .map((table) => table.modelName)
        .sort(),
    ).toEqual(["auth_accounts", "auth_sessions", "auth_two_factor", "auth_verifications", "users"]);
  });

  it("every column Better Auth expects exists in the database, plus id", async () => {
    for (const table of Object.values(tables)) {
      const { rows } = await t.db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [table.modelName],
      );
      const have = new Set(rows.map((row) => row.column_name));
      expect(have.size, `${table.modelName} exists`).toBeGreaterThan(0);
      expect(have.has("id"), `${table.modelName}.id`).toBe(true);
      for (const [name, field] of Object.entries(table.fields)) {
        const column = field.fieldName ?? name;
        expect(have.has(column), `${table.modelName}.${column}`).toBe(true);
      }
    }
  });

  it("columns Better Auth marks required are NOT NULL or have a default", async () => {
    for (const table of Object.values(tables)) {
      const { rows } = await t.db.query<{
        column_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [table.modelName],
      );
      const byName = new Map(rows.map((row) => [row.column_name, row]));
      for (const [name, field] of Object.entries(table.fields)) {
        if (!field.required) continue;
        const row = byName.get(field.fieldName ?? name);
        expect(
          row?.is_nullable === "NO" || row?.column_default !== null,
          `${table.modelName}.${name}`,
        ).toBe(true);
      }
    }
  });

  it("every foreign key column Better Auth declares has a real constraint", async () => {
    const { rows } = await t.db.query<{ child: string; parent: string; col: string }>(
      `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f'`,
    );
    for (const table of Object.values(tables)) {
      for (const [name, field] of Object.entries(table.fields)) {
        if (!field.references) continue;
        const column = field.fieldName ?? name;
        const hit = rows.find((row) => row.child === table.modelName && row.col === column);
        expect(hit?.parent, `${table.modelName}.${column} references users`).toBe("users");
      }
    }
  });
});

describe("identity tables", () => {
  const user = (over: Record<string, unknown> = {}) => ({
    id: uuidv7(),
    name: "Asha",
    email: `p-${uuidv7()}@no-email.invalid`,
    ...over,
  });
  const insertUser = (u: ReturnType<typeof user> & { phone?: string | null; status?: string }) =>
    t.app.query(
      "INSERT INTO users (id, name, email, phone_number, status) VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))",
      [u.id, u.name, u.email, u.phone ?? null, u.status ?? null],
    );

  it("accepts a patient with a phone and a placeholder email, and rejects bad phones and statuses", async () => {
    await insertUser({ ...user(), phone: "+919812345678" });
    await expect(insertUser({ ...user(), phone: "9812345678" })).rejects.toThrow(/check/i);
    await expect(insertUser({ ...user(), phone: "+0123456789" })).rejects.toThrow(/check/i);
    await expect(insertUser({ ...user(), status: "banned" })).rejects.toThrow(/check/i);
  });

  it("keeps phone numbers and emails unique", async () => {
    await insertUser({ ...user(), phone: "+919800000001" });
    await expect(insertUser({ ...user(), phone: "+919800000001" })).rejects.toThrow(
      /unique|duplicate/i,
    );
    const same = user({ email: "dup@example.com" });
    await insertUser(same);
    await expect(insertUser(user({ email: "dup@example.com" }))).rejects.toThrow(
      /unique|duplicate/i,
    );
  });

  it("one external account can belong to only one user", async () => {
    const a = user();
    const b = user();
    await insertUser(a);
    await insertUser(b);
    const link = (userId: string) =>
      t.app.query(
        "INSERT INTO auth_accounts (id, user_id, account_id, provider_id) VALUES ($1, $2, 'google-sub-123', 'google')",
        [uuidv7(), userId],
      );
    await link(a.id);
    await expect(link(b.id)).rejects.toThrow(/unique|duplicate/i);
  });

  it("deleting a user removes sessions, accounts, two-factor, recovery codes and devices", async () => {
    const u = user();
    await insertUser(u);
    await t.app.query(
      "INSERT INTO auth_sessions (id, user_id, token, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
      [uuidv7(), u.id, `tok-${uuidv7()}`],
    );
    await t.app.query(
      "INSERT INTO auth_two_factor (id, user_id, secret, backup_codes) VALUES ($1, $2, 's', 'b')",
      [uuidv7(), u.id],
    );
    await t.app.query("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES ($1, $2, 'h')", [
      uuidv7(),
      u.id,
    ]);
    await t.app.query(
      "INSERT INTO trusted_devices (id, user_id, device_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 days')",
      [uuidv7(), u.id, `dev-${uuidv7()}`],
    );
    await t.app.query("DELETE FROM users WHERE id = $1", [u.id]);
    for (const table of ["auth_sessions", "auth_two_factor", "recovery_codes", "trusted_devices"]) {
      const { rows } = await t.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [u.id],
      );
      expect(rows[0]?.n, table).toBe(0);
    }
  });

  it("the fixed roles exist and the app cannot change them", async () => {
    const { rows } = await t.app.query("SELECT code FROM roles ORDER BY id");
    expect(rows.map((r) => r.code)).toEqual([
      "patient",
      "doctor",
      "admin",
      "super_admin",
      "support",
    ]);
    await expect(t.app.query("INSERT INTO roles (id, code) VALUES (9, 'owner')")).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.app.query("UPDATE roles SET code = 'x' WHERE id = 1")).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.app.query("DELETE FROM roles")).rejects.toThrow(/permission denied/);
  });

  it("updated_at moves on update", async () => {
    const u = user();
    await insertUser(u);
    await t.db.exec(`UPDATE users SET updated_at = '2020-01-01' WHERE id = '${u.id}'`);
    await t.app.query("UPDATE users SET name = 'Asha R' WHERE id = $1", [u.id]);
    const { rows } = await t.db.query<{ fresh: boolean }>(
      "SELECT updated_at > '2025-01-01' AS fresh FROM users WHERE id = $1",
      [u.id],
    );
    expect(rows[0]?.fresh).toBe(true);
  });

  it("the app cannot change the schema of the identity tables", async () => {
    await expect(t.app.query("ALTER TABLE users ADD COLUMN extra int")).rejects.toThrow(
      /must be owner|permission denied/,
    );
  });
});
