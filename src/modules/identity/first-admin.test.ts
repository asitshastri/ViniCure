import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { AdminExistsError, firstAdminInvitation } from "./first-admin";
import { hashToken, type InvitationCrypto } from "./invitations";
import { IdentityRepo } from "./repo";

// The first administrator of a new site: one invitation, once, and never when an admin exists.
let db: Queryable;
let repo: IdentityRepo;
const crypto: InvitationCrypto = {
  seal: async (v) => v,
  unseal: async (v) => v,
  newSecret: () => "secret",
  newBackupCodes: async () => ({ codes: [], stored: "[]" }),
  hashPassword: async (p) => p,
};
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

beforeAll(async () => {
  const pg = await createTestDb();
  db = {
    query: async (t, p) => ({ rows: (await pg.db.query(t, p)).rows as Record<string, unknown>[] }),
  };
  repo = new IdentityRepo(db);
}, 60_000);

describe("firstAdminInvitation", () => {
  it("makes an admin invitation, prints a link whose token matches the stored hash, and stores only the hash", async () => {
    const out = await firstAdminInvitation({
      db,
      repo,
      crypto,
      appUrl: "https://site.example",
      email: "First.Admin@Example.com",
    });
    expect(out.expiresInHours).toBe(72);
    const token = out.link.split("/invite/")[1] as string;
    expect(out.link.startsWith("https://site.example/invite/")).toBe(true);
    const [inv] = await rows("SELECT email, role_code, token_hash, accepted_at FROM invitations");
    expect(inv).toMatchObject({
      email: "first.admin@example.com",
      role_code: "admin",
      accepted_at: null,
    });
    expect(inv?.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(inv)).not.toContain(token);
  });

  it("refuses when an administrator already exists, and changes nothing", async () => {
    const id = uuidv7();
    await db.query(
      "INSERT INTO users (id, name, email) VALUES ($1, 'Admin', 'admin@example.com')",
      [id],
    );
    await db.query(
      "INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'admin'",
      [id],
    );
    const before = await rows("SELECT id FROM invitations");
    await expect(
      firstAdminInvitation({
        db,
        repo,
        crypto,
        appUrl: "https://site.example",
        email: "second@example.com",
      }),
    ).rejects.toBeInstanceOf(AdminExistsError);
    expect(await rows("SELECT id FROM invitations")).toHaveLength(before.length);
  });

  it("refuses a bad address", async () => {
    await expect(
      firstAdminInvitation({
        db,
        repo,
        crypto,
        appUrl: "https://site.example",
        email: "not-an-email",
      }),
    ).rejects.toThrow(/email/);
  });
});
