import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import { uuidv7 } from "../../lib/ids";
import type { Queryable } from "../../lib/db/queryable";
import { PaymentRepo } from "./repo";
import { PaymentService } from "./service";

// Order creation as the real `app` role on real Postgres, with a connection per request.
// Skipped unless DATABASE_TEST_URL is set.
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("payment orders on real Postgres", () => {
  let pool: pg.Pool;
  let service: PaymentService;
  const gateway = new FakePaymentProvider();

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 10 });
    service = new PaymentService({
      repo: new PaymentRepo(
        {
          query: async (text, params) => ({
            rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
          }),
        },
        {
          async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              const out = await fn({
                query: async (text, params) => ({
                  rows: (await client.query(text, params)).rows as Record<string, unknown>[],
                }),
              });
              await client.query("COMMIT");
              return out;
            } catch (error) {
              await client.query("ROLLBACK").catch(() => undefined);
              throw error;
            } finally {
              client.release();
            }
          },
        },
      ),
      gateway: () => gateway,
      publicKeyId: () => "rzp_test_public",
    });
  });
  afterAll(() => pool.end());

  async function held() {
    const user = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
      user,
      `${user}@no-email.invalid`,
    ]);
    const patient = uuidv7();
    await pool.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Pay Person','1990-01-01','female',false)`,
      [patient, user],
    );
    const doctor = uuidv7();
    await pool.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
       VALUES ($1,'Dr Pay',$2,'Council','MBBS',$3)`,
      [doctor, `PI-${doctor.slice(-8)}`, `${doctor}@example.com`],
    );
    const appt = uuidv7();
    const start = new Date(Date.now() + 200 * 86_400_000 + Math.floor(Math.random() * 1e6) * 1000);
    await pool.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'held',30000, now() + interval '10 minutes')`,
      [appt, patient, doctor, user, start, new Date(start.getTime() + 1_800_000)],
    );
    return { principal: { userId: user, roles: ["patient" as const] }, appt };
  }

  it("ten identical requests at once make one payment; ten different keys stop at the cap", async () => {
    const { principal, appt } = await held();
    const same = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.createOrder(principal, { appointmentId: appt }, "same-key-for-all-ten"),
      ),
    );
    expect(same.every((r) => r.status === "fulfilled")).toBe(true);
    const count = await pool.query(
      "SELECT count(*)::int AS n FROM payments WHERE appointment_id=$1",
      [appt],
    );
    expect(count.rows[0]?.n).toBe(1);

    const other = await held();
    const different = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        service.createOrder(
          other.principal,
          { appointmentId: other.appt },
          `different-key-number-${i}`,
        ),
      ),
    );
    expect(different.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const total = await pool.query(
      "SELECT count(*)::int AS n FROM payments WHERE appointment_id=$1",
      [other.appt],
    );
    expect(total.rows[0]?.n).toBe(3);
  });
});
