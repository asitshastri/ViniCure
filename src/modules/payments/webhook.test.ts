import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import { setPaymentPartsForTest } from "./index";
import { PaymentService } from "./service";
import { sanitizeWebhook } from "./webhook-parse";
import { createPaymentServices } from "./wiring";

let q: Queryable;
let tx: TxRunner;
let gateway: FakePaymentProvider;
let parts: ReturnType<typeof createPaymentServices>;
let orders: PaymentService;
let queued: number[];
let userId: string;
let patientId: string;
let doctorId: string;
let n = 0;

const status = async (table: string, id: string) =>
  String((await q.query(`SELECT status FROM ${table} WHERE id=$1`, [id])).rows[0]?.status);
const count = async (sql: string, params: unknown[] = []) =>
  Number((await q.query(sql, params)).rows[0]?.n);

/** Rows made since this test began (the tables are shared and append-only). */
let eventsBefore = 0;
let refundsBefore = 0;
const events = async (columns = "*") =>
  (await q.query(`SELECT ${columns} FROM payment_events WHERE id > ${eventsBefore} ORDER BY id`))
    .rows;
const refundCount = async () =>
  (await count("SELECT count(*)::int AS n FROM refunds")) - refundsBefore;

async function appointment(opts: { status?: string; expires?: string; offsetHours?: number } = {}) {
  const id = uuidv7();
  const status = opts.status ?? "held";
  const start = new Date(Date.UTC(2031, 0, 1) + (opts.offsetHours ?? ++n) * 3_600_000);
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,49900, CASE WHEN $7 = 'held' THEN now() + $8::interval END)`,
    [
      id,
      patientId,
      doctorId,
      userId,
      start,
      new Date(start.getTime() + 1_800_000),
      status,
      opts.expires ?? "10 minutes",
    ],
  );
  return { id, start };
}

/** An order made through the real service, and the gateway payment id the customer would get. */
async function order(apptId: string, key = `order-key-${++n}-padding`) {
  const view = await orders.createOrder(
    { userId, roles: ["patient"] },
    { appointmentId: apptId },
    key,
  );
  const gwPay = `pay_${String(++n).padStart(8, "0")}`;
  return { ...view, gwPay };
}

const capturedBody = (
  o: { orderId: string; gwPay: string },
  extra: Record<string, unknown> = {},
  event = "payment.captured",
) =>
  JSON.stringify({
    event,
    payload: {
      payment: {
        entity: {
          id: o.gwPay,
          order_id: o.orderId,
          amount: 49900,
          status: "captured",
          method: "upi",
          email: "payer@example.com",
          contact: "+919876543210",
          vpa: "payer@okbank",
          card: { last4: "1111" },
          ...extra,
        },
      },
    },
  });

const send = (body: string, over: { signature?: string; eventId?: string | null } = {}) =>
  parts.webhook.receive({
    rawBody: body,
    signature: over.signature ?? gateway.signWebhook(body),
    eventIdHeader: over.eventId === undefined ? `evt_${++n}_abcdefgh` : over.eventId,
  });

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (t, p) => ({ rows: (await pg.db.query(t, p)).rows as Record<string, unknown>[] }),
  };
  tx = {
    transaction: (fn) =>
      pg.db.transaction((t) =>
        fn({
          query: async (text, params) => ({
            rows: (await t.query(text, params)).rows as Record<string, unknown>[],
          }),
        }),
      ),
  };
}, 60_000);

beforeEach(async () => {
  eventsBefore = Number(
    (await q.query("SELECT COALESCE(max(id), 0)::int AS n FROM payment_events")).rows[0]?.n,
  );
  refundsBefore = await count("SELECT count(*)::int AS n FROM refunds");
  gateway = new FakePaymentProvider();
  queued = [];
  parts = createPaymentServices({
    db: q,
    tx,
    gateway: () => gateway,
    enqueue: async (id) => void queued.push(id),
  });
  orders = new PaymentService({
    repo: parts.repo,
    gateway: () => gateway,
    publicKeyId: () => "rzp_test",
  });
  userId = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    userId,
    `${userId}@no-email.invalid`,
  ]);
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patientId, userId],
  );
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,'Dr Hook',$2,'Council','MBBS',$3)`,
    [doctorId, `WH-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
  );
});

describe("signature", () => {
  it("a bad, missing or tampered signature is refused and nothing is stored or queued", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    const body = capturedBody(o);
    expect(await send(body, { signature: "nope" })).toBe("bad_signature");
    expect(await send(body, { signature: "" })).toBe("bad_signature");
    expect(await send(body.replace("49900", "1"), { signature: gateway.signWebhook(body) })).toBe(
      "bad_signature",
    );
    // Signed with the wrong secret.
    expect(
      await send(body, { signature: new FakePaymentProvider("a", "b").signWebhook(body) }),
    ).toBe("bad_signature");
    expect(await events()).toHaveLength(0);
    expect(queued).toEqual([]);
    expect(await status("payments", o.paymentId)).toBe("created");
  });
});

describe("a payment arriving", () => {
  it("is stored once, handled by the worker, confirms the appointment and records the payment", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    expect(await send(capturedBody(o))).toBe("accepted");
    expect(queued).toHaveLength(1);
    // Nothing happens until the worker runs.
    expect(await status("payments", o.paymentId)).toBe("created");
    expect(await parts.webhook.process(queued[0] as number)).toBe("handled");
    expect(await status("payments", o.paymentId)).toBe("captured");
    expect(await status("appointments", appt.id)).toBe("scheduled");
    const pay = (
      await q.query("SELECT gateway_payment_id, captured_at FROM payments WHERE id=$1", [
        o.paymentId,
      ])
    ).rows[0];
    expect(pay?.gateway_payment_id).toBe(o.gwPay);
    expect(pay?.captured_at).not.toBeNull();
    expect((await events("processed_at"))[0]?.processed_at).not.toBeNull();
  });

  it("only the whitelisted facts are kept: no contact details, VPA or card data", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    const stored = JSON.stringify((await events("payload"))[0]?.payload);
    for (const secret of [
      "payer@example.com",
      "9876543210",
      "okbank",
      "1111",
      "contact",
      "vpa",
      "card",
    ]) {
      expect(stored, secret).not.toContain(secret);
    }
    expect(JSON.parse(stored)).toMatchObject({
      event: "payment.captured",
      paymentId: o.gwPay,
      orderId: o.orderId,
      amountPaise: 49900,
      method: "upi",
    });
  });

  it("a replay of the same event is acknowledged and ignored; handling twice changes nothing more", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    const body = capturedBody(o);
    expect(await send(body, { eventId: "evt_same_event_id" })).toBe("accepted");
    expect(await send(body, { eventId: "evt_same_event_id" })).toBe("duplicate");
    expect(await events()).toHaveLength(1);
    await parts.webhook.process(queued[0] as number);
    expect(await parts.webhook.process(queued[0] as number)).toBe("skipped");
    const history = await count(
      "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='scheduled'",
      [appt.id],
    );
    expect(history).toBe(1);
  });

  it("the same body under a different event id is stored again but cannot pay twice", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    const body = capturedBody(o);
    await send(body);
    await send(body);
    for (const id of queued) await parts.webhook.process(id);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='scheduled'",
        [appt.id],
      ),
    ).toBe(1);
    expect(await refundCount()).toBe(0);
  });

  it("order.paid works like payment.captured", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o, {}, "order.paid"));
    await parts.webhook.process(queued[0] as number);
    expect(await status("appointments", appt.id)).toBe("scheduled");
  });
});

describe("events out of order", () => {
  it("a failure that arrives after the capture does not undo it", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    await send(
      capturedBody(o, { status: "failed", error_code: "BAD_REQUEST_ERROR" }, "payment.failed"),
    );
    for (const id of queued) await parts.webhook.process(id);
    expect(await status("payments", o.paymentId)).toBe("captured");
    expect(await status("appointments", appt.id)).toBe("scheduled");
  });

  it("a failed attempt can still be paid afterwards on the same order", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    await send(
      capturedBody(o, { status: "failed", error_code: "GATEWAY_ERROR" }, "payment.failed"),
    );
    await parts.webhook.process(queued[0] as number);
    expect(await status("payments", o.paymentId)).toBe("failed");
    expect(
      String(
        (await q.query("SELECT failure_code FROM payments WHERE id=$1", [o.paymentId])).rows[0]
          ?.failure_code,
      ),
    ).toBe("GATEWAY_ERROR");
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    await parts.webhook.process(queued[1] as number);
    expect(await status("payments", o.paymentId)).toBe("captured");
    expect(await status("appointments", appt.id)).toBe("scheduled");
    expect(
      (await q.query("SELECT failure_code FROM payments WHERE id=$1", [o.paymentId])).rows[0]
        ?.failure_code,
    ).toBeNull();
  });
});

describe("what the webhook is not believed about", () => {
  it("the amount in the body is ignored: the gateway's own record decides", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    // The body claims the full amount, but the gateway actually holds less.
    gateway.payments.set(o.gwPay, {
      orderId: o.orderId,
      amountPaise: 100,
      status: "captured",
      refundedPaise: 0,
    });
    await send(capturedBody(o));
    await parts.webhook.process(queued[0] as number);
    expect(await status("payments", o.paymentId)).toBe("created");
    expect(await status("appointments", appt.id)).toBe("held");
  });

  it("a payment for another order than the one named is not applied", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    const other = await appointment();
    const o2 = await order(other.id);
    gateway.capture(o2.gwPay, o2.orderId); // really paid o2
    await send(capturedBody({ orderId: o.orderId, gwPay: o2.gwPay })); // claims it paid o
    await parts.webhook.process(queued[0] as number);
    expect(await status("payments", o.paymentId)).toBe("created");
    expect(await status("appointments", appt.id)).toBe("held");
  });

  it("a payment the gateway has not captured (only authorised) changes nothing yet", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.payments.set(o.gwPay, {
      orderId: o.orderId,
      amountPaise: 49900,
      status: "authorized",
      refundedPaise: 0,
    });
    await send(capturedBody(o));
    await parts.webhook.process(queued[0] as number);
    expect(await status("payments", o.paymentId)).toBe("created");
    expect(await status("appointments", appt.id)).toBe("held");
  });

  it("money for an order we never made is stored and flagged, and changes nothing", async () => {
    const body = capturedBody({ orderId: "order_unknown00001", gwPay: "pay_unknown000001" });
    expect(await send(body)).toBe("accepted");
    expect(await parts.webhook.process(queued[0] as number)).toBe("handled");
    expect((await events("payment_id"))[0]?.payment_id).toBeNull();
  });

  it("a signed body that is not a usable event is acknowledged and not stored", async () => {
    for (const body of [
      "not json",
      "[]",
      '{"event":"x"}',
      '{"event":"Payment Captured"}',
      "null",
    ]) {
      expect(await send(body), body).toBe("ignored");
    }
    expect(await events()).toHaveLength(0);
  });
});

describe("late and double payments", () => {
  it("a payment after the hold ran out, with the time still free, confirms the appointment", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    await q.query(
      "UPDATE appointments SET hold_expires_at = now() - interval '1 minute' WHERE id=$1",
      [appt.id],
    );
    await q.query(
      "WITH g AS (UPDATE appointments SET status='expired', hold_expires_at=NULL WHERE id=$1 RETURNING id) SELECT 1",
      [appt.id],
    );
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    await parts.webhook.process(queued[0] as number);
    expect(await status("appointments", appt.id)).toBe("scheduled");
    expect(await status("payments", o.paymentId)).toBe("captured");
    expect(await refundCount()).toBe(0);
  });

  it("a payment after the time went to someone else is refunded in full and the appointment stays expired", async () => {
    const appt = await appointment({ offsetHours: 5000 });
    const o = await order(appt.id);
    await q.query("UPDATE appointments SET status='expired', hold_expires_at=NULL WHERE id=$1", [
      appt.id,
    ]);
    // Another patient now holds the same time.
    const rival = uuidv7();
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'held',49900, now() + interval '10 minutes')`,
      [rival, patientId, doctorId, userId, appt.start, new Date(appt.start.getTime() + 1_800_000)],
    );
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    await parts.webhook.process(queued[0] as number);
    expect(await status("appointments", appt.id)).toBe("expired");
    expect(await status("appointments", rival)).toBe("held");
    const refund = (
      await q.query(
        "SELECT amount_paise, status, gateway_refund_id, reason FROM refunds ORDER BY created_at DESC, id DESC LIMIT 1",
      )
    ).rows[0];
    expect(refund).toMatchObject({ amount_paise: 49900, status: "initiated" });
    expect(refund?.gateway_refund_id).toBeTruthy();
    expect(gateway.refunds.size).toBe(1);
    // Handling the same event again does not refund twice.
    await send(capturedBody(o));
    await parts.webhook.process(queued[1] as number);
    expect(gateway.refunds.size).toBe(1);
    expect(await refundCount()).toBe(1);
  });

  it("a booking cancelled while the customer was paying is refunded", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    await q.query(
      "UPDATE appointments SET status='cancelled_by_patient', hold_expires_at=NULL WHERE id=$1",
      [appt.id],
    );
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    await parts.webhook.process(queued[0] as number);
    expect(gateway.refunds.size).toBe(1);
    expect(await status("appointments", appt.id)).toBe("cancelled_by_patient");
  });

  it("two orders for one appointment both paid: the first stands, the second is refunded", async () => {
    const appt = await appointment();
    const first = await order(appt.id);
    const second = await order(appt.id);
    gateway.capture(first.gwPay, first.orderId);
    gateway.capture(second.gwPay, second.orderId);
    await send(capturedBody(first));
    await send(capturedBody(second));
    for (const id of queued) await parts.webhook.process(id);
    expect(await status("payments", first.paymentId)).toBe("captured");
    expect(await status("payments", second.paymentId)).toBe("failed");
    expect(
      String(
        (await q.query("SELECT failure_code FROM payments WHERE id=$1", [second.paymentId])).rows[0]
          ?.failure_code,
      ),
    ).toBe("duplicate_paid");
    expect(gateway.refunds.size).toBe(1);
    expect([...gateway.refunds.values()][0]).toMatchObject({
      paymentId: second.gwPay,
      amountPaise: 49900,
    });
    expect(await status("appointments", appt.id)).toBe("scheduled");
  });
});

describe("repair and retry", () => {
  it("a payment recorded as captured whose appointment was never confirmed is confirmed on the next run", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    // The process stopped after the payment was recorded and before the appointment was confirmed.
    await parts.repo.markCaptured(o.paymentId, o.gwPay);
    gateway.capture(o.gwPay, o.orderId);
    expect(await status("appointments", appt.id)).toBe("held");
    await send(capturedBody(o));
    await parts.webhook.process(queued[0] as number);
    expect(await status("appointments", appt.id)).toBe("scheduled");
  });

  it("when the gateway cannot be reached the event stays unhandled, and a retry finishes it", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    gateway.failures.failNext();
    await expect(parts.webhook.process(queued[0] as number)).rejects.toThrow();
    expect((await events("processed_at"))[0]?.processed_at).toBeNull();
    expect(await status("appointments", appt.id)).toBe("held");
    await parts.webhook.process(queued[0] as number);
    expect(await status("appointments", appt.id)).toBe("scheduled");
  });

  it("the sweep re-queues events that were stored but never handled", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    await send(capturedBody(o));
    const mine = queued[0] as number;
    queued.length = 0; // the job was lost
    await parts.webhook.sweep(10_000);
    expect(queued).toContain(mine);
    await parts.webhook.process(mine);
    queued.length = 0;
    await parts.webhook.sweep(10_000);
    expect(queued).not.toContain(mine);
  });

  it("an enqueue failure does not lose the event or fail the callback", async () => {
    const appt = await appointment();
    const o = await order(appt.id);
    const failing = createPaymentServices({
      db: q,
      tx,
      gateway: () => gateway,
      enqueue: async () => {
        throw new Error("queue down");
      },
    });
    const body = capturedBody(o);
    expect(
      await failing.webhook.receive({
        rawBody: body,
        signature: gateway.signWebhook(body),
        eventIdHeader: "evt_queue_down_x1",
      }),
    ).toBe("accepted");
    expect((await events("processed_at")).filter((e) => e.processed_at === null).length).toBe(1);
  });
});

describe("the parser", () => {
  it("keeps only patterned ids, amounts and words", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_abc123XYZ",
            order_id: "order_x'; DROP",
            amount: -5,
            status: "captured",
            method: "UPI card",
            error_code: 7,
          },
        },
      },
    });
    expect(sanitizeWebhook(body)).toEqual({
      event: "payment.captured",
      paymentId: "pay_abc123XYZ",
      status: "captured",
    });
    expect(
      sanitizeWebhook(
        '{"event":"refund.processed","payload":{"refund":{"entity":{"id":"rfnd_abc12345","payment_id":"pay_abc123XYZ","amount":1000,"status":"processed"}}}}',
      ),
    ).toEqual({
      event: "refund.processed",
      refundId: "rfnd_abc12345",
      refundPaymentId: "pay_abc123XYZ",
      refundAmountPaise: 1000,
      refundStatus: "processed",
    });
  });
});

describe("the route", () => {
  it("answers 401 for a bad signature and 200 for a signed event, and never echoes the body", async () => {
    setPaymentPartsForTest(parts);
    const appt = await appointment();
    const o = await order(appt.id);
    gateway.capture(o.gwPay, o.orderId);
    const body = capturedBody(o);
    const mod = (await import("../../app/api/webhooks/razorpay/route")) as {
      POST: (r: Request, c?: unknown) => Promise<Response>;
    };
    const call = (signature: string) =>
      mod.POST(
        new Request("http://localhost:3000/api/webhooks/razorpay", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-razorpay-signature": signature,
            "x-razorpay-event-id": `evt_route_${++n}_xx`,
            host: "localhost:3000",
          },
          body,
        }),
      );
    const bad = await call("wrong");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("cache-control")).toBe("no-store");
    expect(await bad.text()).not.toContain("payer@example.com");
    const good = await call(gateway.signWebhook(body));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ status: "accepted" });
    setPaymentPartsForTest(undefined);
  });
});
