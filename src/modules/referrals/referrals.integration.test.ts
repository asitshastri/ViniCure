import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Queryable } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { ReferralRepo } from "./repo";
import { ReferralService } from "./service";

// The referral cap against real Postgres as the `app` role, with many people entering one code
// at the same moment. Skipped unless DATABASE_TEST_URL is set.
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("referrals on real Postgres", () => {
  let pool: pg.Pool;
  let service: ReferralService;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 12 });
    const db: Queryable = {
      query: async (text, params) => ({
        rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
      }),
    };
    service = new ReferralService({
      repo: new ReferralRepo(db, {
        async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const out = await fn({
              query: async (t, p) => ({
                rows: (await client.query(t, p)).rows as Record<string, unknown>[],
              }),
            });
            await client.query("COMMIT");
            return out;
          } catch (e) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw e;
          } finally {
            client.release();
          }
        },
      }),
      enabled: () => true,
      cap: () => 3,
      rewardPaise: () => 0,
    });
  });
  afterAll(() => pool.end());

  const person = async () => {
    const id = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
      id,
      `${id}@no-email.invalid`,
    ]);
    return { userId: id, roles: ["patient" as const] };
  };

  it("ten people entering one code at once: exactly the cap get in", async () => {
    const referrer = await person();
    const { code } = await service.summary(referrer);
    const others = await Promise.all(Array.from({ length: 10 }, person));
    const results = await Promise.all(
      others.map((o) =>
        service.redeem(o, { code }).then(
          () => "in",
          () => "refused",
        ),
      ),
    );
    expect(results.filter((r) => r === "in")).toHaveLength(3);
    expect((await service.summary(referrer)).invited).toBe(3);
  });

  it("one person entering ten different codes at once is referred once", async () => {
    const newcomer = await person();
    const codes = await Promise.all(
      Array.from({ length: 10 }, async () => (await service.summary(await person())).code),
    );
    const results = await Promise.all(
      codes.map((code) =>
        service.redeem(newcomer, { code }).then(
          () => "in",
          () => "refused",
        ),
      ),
    );
    expect(results.filter((r) => r === "in")).toHaveLength(1);
    const rows = await pool.query(
      "SELECT count(*)::int AS n FROM referrals WHERE referred_user_id=$1",
      [newcomer.userId],
    );
    expect(rows.rows[0]?.n).toBe(1);
  });
});
