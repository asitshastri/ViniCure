import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { PaymentService } from "./service";
import { createPaymentServices } from "./wiring";

// The webhook against real Postgres as the `app` role, with callbacks and workers running at the
// same moment. Skipped unless DATABASE_TEST_URL is set.
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("payment webhook on real Postgres", () => {
  let pool: pg.Pool;
  const gateway = new FakePaymentProvider();
  let parts: ReturnType<typeof createPaymentServices>;
  let orders: PaymentService;
  const queued: number[] = [];

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 12 });
    const db: Queryable = {
      query: async (text, params) => ({
        rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
      }),
    };
    parts = createPaymentServices({
      feeBps: () => 0,
      db,
      tx: {
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
      },
      gateway: () => gateway,
      enqueue: async (id) => void queued.push(id),
    });
    orders = new PaymentService({
      repo: parts.repo,
      gateway: () => gateway,
      publicKeyId: () => "rzp_test",
    });
  });
  afterAll(() => pool.end());

  async function paid() {
    const user = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
      user,
      `${user}@no-email.invalid`,
    ]);
    const patient = uuidv7();
    await pool.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Hook Person','1990-01-01','female',false)`,
      [patient, user],
    );
    const doctor = uuidv7();
    await pool.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
       VALUES ($1,'Dr Hook',$2,'Council','MBBS',$3)`,
      [doctor, `WI-${doctor.slice(-8)}`, `${doctor}@example.com`],
    );
    const appt = uuidv7();
    const start = new Date(Date.now() + 300 * 86_400_000 + Math.floor(Math.random() * 1e6) * 1000);
    await pool.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'held',30000, now() + interval '10 minutes')`,
      [appt, patient, doctor, user, start, new Date(start.getTime() + 1_800_000)],
    );
    const order = await orders.createOrder(
      { userId: user, roles: ["patient"] },
      { appointmentId: appt },
      `integration-key-${appt}`,
    );
    const gwPay = `pay_${appt.replaceAll("-", "").slice(0, 14)}`;
    gateway.capture(gwPay, order.orderId);
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: gwPay,
            order_id: order.orderId,
            amount: 30000,
            status: "captured",
            method: "upi",
          },
        },
      },
    });
    return { appt, order, gwPay, body };
  }

  it("the same callback delivered ten times at once stores one event; two workers on it confirm once", async () => {
    const { appt, order, body } = await paid();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        parts.webhook.receive({
          rawBody: body,
          signature: gateway.signWebhook(body),
          eventIdHeader: `evt_${appt}_same`,
        }),
      ),
    );
    expect(results.filter((r) => r === "accepted")).toHaveLength(1);
    expect(results.filter((r) => r === "duplicate")).toHaveLength(9);
    const events = await pool.query("SELECT id FROM payment_events WHERE gateway_event_id = $1", [
      `evt_${appt}_same`,
    ]);
    expect(events.rows).toHaveLength(1);
    const id = Number(events.rows[0]?.id);
    await Promise.all([
      parts.webhook.process(id),
      parts.webhook.process(id),
      parts.webhook.process(id),
    ]);
    expect(
      (await pool.query("SELECT status FROM appointments WHERE id=$1", [appt])).rows[0]?.status,
    ).toBe("scheduled");
    expect(
      (await pool.query("SELECT status FROM payments WHERE id=$1", [order.paymentId])).rows[0]
        ?.status,
    ).toBe("captured");
    const history = await pool.query(
      "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='scheduled'",
      [appt],
    );
    expect(history.rows[0]?.n).toBe(1);
    expect(
      (await pool.query("SELECT processed_at FROM payment_events WHERE id=$1", [id])).rows[0]
        ?.processed_at,
    ).not.toBeNull();
  });

  it("the app role cannot rewrite or delete a stored event", async () => {
    await expect(pool.query("UPDATE payment_events SET payload = '{}'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(pool.query("DELETE FROM payment_events")).rejects.toThrow(/permission denied/);
  });

  it("six settlements of one payment at once write the two ledger entries once, and the app role cannot change them", async () => {
    const { order, gwPay } = await paid();
    const payment = (await parts.repo.findById(order.paymentId))!;
    await Promise.all(Array.from({ length: 6 }, () => parts.settlement.settle(payment, gwPay)));
    const rows = await pool.query(
      "SELECT entry_type, amount_paise FROM earnings_ledger WHERE payment_id=$1 ORDER BY entry_type",
      [order.paymentId],
    );
    expect(rows.rows.map((r) => [r.entry_type, Number(r.amount_paise)])).toEqual([
      ["doctor_share", 30000],
      ["platform_fee", 0],
    ]);
    await expect(pool.query("UPDATE earnings_ledger SET amount_paise = 1")).rejects.toThrow(
      /permission denied/,
    );
    await expect(pool.query("DELETE FROM earnings_ledger")).rejects.toThrow(/permission denied/);
  });
});
