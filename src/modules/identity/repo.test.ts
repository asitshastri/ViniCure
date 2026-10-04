import { describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { IdentityRepo } from "./repo";

// The test database applies migrations as its own superuser, so table grants for the app role
// are checked by the Docker integration tests instead; here the queries run directly.
function direct(db: Awaited<ReturnType<typeof createTestDb>>): Queryable {
  return {
    query: async (text, params) => ({
      rows: (await db.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
}

async function addUser(db: Awaited<ReturnType<typeof createTestDb>>, phone: string) {
  const id = uuidv7();
  await direct(db).query(
    `INSERT INTO users (id, name, email, phone_number, phone_number_verified)
     VALUES ($1, 'Patient', $2, $3, true)`,
    [id, `${id}@no-email.invalid`, phone],
  );
  return id;
}

describe("IdentityRepo.recordPhoneVerified", () => {
  it("gives a new user the patient role, once, and leaves the sign-in times to the step-up decision", async () => {
    const db = await createTestDb();
    const repo = new IdentityRepo(direct(db));
    const id = await addUser(db, "+919876543210");
    await repo.recordPhoneVerified(id);
    await repo.recordPhoneVerified(id);
    expect(await repo.rolesOf(id)).toEqual(["patient"]);
    // The risk decision reads the previous times first, so this call must not overwrite them.
    const { rows } = await direct(db).query(
      `SELECT phone_verified_at, last_active_at FROM users WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.phone_verified_at).toBeNull();
    expect(rows[0]?.last_active_at).toBeNull();
  });

  it("never adds the patient role to a user who already has a role (staff)", async () => {
    const db = await createTestDb();
    const repo = new IdentityRepo(direct(db));
    const id = await addUser(db, "+919876543211");
    await direct(db).query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1::uuid, id FROM roles WHERE code = 'doctor'`,
      [id],
    );
    await repo.recordPhoneVerified(id);
    expect(await repo.rolesOf(id)).toEqual(["doctor"]);
  });
});
