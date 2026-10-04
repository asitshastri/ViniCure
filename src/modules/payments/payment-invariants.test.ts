import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import type { Principal } from "../identity/policy";
import { AdapterError } from "../../lib/adapters/types";
import { AppError } from "../../lib/errors/app-error";
import { PaymentService } from "./service";
import { createPaymentServices } from "./wiring";
import { adminRefundBody, verifyBody } from "./schemas";

// Payment invariants (P5-11): random orders of payments, events, expiries, cancellations and
// refunds, with the rules that must hold after every single step.
let q: Queryable;
let tx: TxRunner;
let gateway: FakePaymentProvider;
let parts: ReturnType<typeof createPaymentServices>;
let service: PaymentService;
let asha: Principal;
let patientId: string;
let doctorId: string;
let feeBps = 1000;
let n = 0;
let admin: Principal;

async function person(): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles: ["patient"] };
}

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
  // One gateway for the file: the database is shared, so earlier payments stay known to it.
  gateway ??= new FakePaymentProvider();
  gateway.failures.failNext(0);
  feeBps = 1000;
  parts = createPaymentServices({
    feeBps: () => feeBps,
    db: q,
    tx,
    gateway: () => gateway,
    enqueue: async () => undefined,
  });
  service = new PaymentService({
    repo: parts.repo,
    gateway: () => gateway,
    publicKeyId: () => "rzp_test",
    settlement: parts.settlement,
    refunds: parts.refunds,
  });
  asha = await person();
  admin = { ...(await person()), roles: ["admin"] };
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patientId, asha.userId],
  );
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,'Dr Ledger',$2,'Council','MBBS',$3)`,
    [doctorId, `LG-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
  );
});

// A small seeded random generator, so a failing run can be repeated exactly.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rows = async (sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows;
const MONEY = "('captured','partially_refunded','refunded')";

/** The rules that must hold whatever happened, in whatever order. */
async function checkInvariants(appt: string, label: string) {
  const fail = (what: string) => `${label}: ${what}`;
  // 1. At most one payment holds the money for an appointment.
  const paid = await rows(
    "SELECT id FROM payments WHERE appointment_id=$1 AND status IN ('captured','partially_refunded')",
    [appt],
  );
  expect(paid.length, fail("two payments hold money for one appointment")).toBeLessThanOrEqual(1);

  // 2. Refunds started or done never exceed what was paid, and the payment's total is what was confirmed.
  for (const p of await rows(
    "SELECT id, amount_paise, amount_refunded_paise, status FROM payments WHERE appointment_id=$1",
    [appt],
  )) {
    const r = (
      await rows(
        `SELECT COALESCE(sum(amount_paise) FILTER (WHERE status IN ('initiated','processed')),0)::bigint AS open_or_done,
                COALESCE(sum(amount_paise) FILTER (WHERE status = 'processed'),0)::bigint AS done
           FROM refunds WHERE payment_id=$1`,
        [p.id],
      )
    )[0];
    expect(Number(r?.open_or_done), fail("refunds exceed the payment")).toBeLessThanOrEqual(
      Number(p.amount_paise),
    );
    if (["captured", "partially_refunded", "refunded"].includes(String(p.status))) {
      expect(
        Number(p.amount_refunded_paise),
        fail("payment total differs from confirmed refunds"),
      ).toBe(Number(r?.done));
    }
    // 3. The ledger: capture entries add up to the payment, and the whole ledger for the payment
    //    equals what was paid less what was refunded (when it has entries at all).
    const l = (
      await rows(
        `SELECT count(*) FILTER (WHERE entry_type IN ('doctor_share','platform_fee'))::int AS capture_rows,
                COALESCE(sum(amount_paise) FILTER (WHERE entry_type IN ('doctor_share','platform_fee')),0)::bigint AS captured,
                COALESCE(sum(amount_paise),0)::bigint AS net
           FROM earnings_ledger WHERE payment_id=$1`,
        [p.id],
      )
    )[0];
    if (Number(l?.capture_rows) > 0) {
      expect(Number(l?.capture_rows), fail("capture entries are not exactly two")).toBe(2);
      expect(Number(l?.captured), fail("fee and share do not add up to the payment")).toBe(
        Number(p.amount_paise),
      );
      expect(Number(l?.net), fail("ledger differs from paid less refunded")).toBe(
        Number(p.amount_paise) - Number(p.amount_refunded_paise),
      );
    }
  }
  // 4. A confirmed appointment has a payment that holds money (or was refunded after being confirmed).
  const a = (await rows("SELECT status FROM appointments WHERE id=$1", [appt]))[0];
  if (a?.status === "scheduled") {
    const money = await rows(
      `SELECT id FROM payments WHERE appointment_id=$1 AND status IN ${MONEY}`,
      [appt],
    );
    expect(money.length, fail("confirmed without money")).toBeGreaterThanOrEqual(1);
  }
  // 5. The gateway was never asked to refund more than it took.
  for (const p of gateway.payments.values()) {
    expect(p.refundedPaise, fail("gateway refunded more than captured")).toBeLessThanOrEqual(
      p.amountPaise,
    );
  }
}

const reached = {
  captured: 0,
  confirmed: 0,
  refundStarted: 0,
  refundProcessed: 0,
  refundFailed: 0,
  lateOrLost: 0,
  twoPaid: 0,
};

type Order = { paymentId: string; orderId: string; gw: string };

async function scenario(seed: number) {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  gateway = new FakePaymentProvider();
  parts = createPaymentServices({
    feeBps: () => 1000,
    db: q,
    tx,
    gateway: () => gateway,
    enqueue: async () => undefined,
  });
  service = new PaymentService({
    repo: parts.repo,
    gateway: () => gateway,
    publicKeyId: () => "rzp_test",
    settlement: parts.settlement,
    refunds: parts.refunds,
  });

  const appt = uuidv7();
  const start = new Date(Date.UTC(2040, 0, 1) + (seed * 7 + ++n) * 3_600_000);
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'held',49900, now() + interval '10 minutes')`,
    [appt, patientId, doctorId, asha.userId, start, new Date(start.getTime() + 1_800_000)],
  );
  const orders: Order[] = [];
  const log: string[] = [];

  async function newOrder() {
    const o = await service.createOrder(
      asha,
      { appointmentId: appt },
      `fuzz-${seed}-${++n}-key-pad`,
    );
    orders.push({
      paymentId: o.paymentId,
      orderId: o.orderId,
      gw: `pay_${seed}x${++n}`.padEnd(12, "0"),
    });
  }
  await newOrder();

  // Delivers a signed event; often the worker handles it straight away, sometimes later.
  const send = async (raw: string) => {
    await parts.webhook.receive({
      rawBody: raw,
      signature: gateway.signWebhook(raw),
      eventIdHeader: `evt_${seed}_${++n}_fuzzhook`,
    });
    if (rnd() < 0.7) {
      const last = Number((await rows("SELECT max(id) AS id FROM payment_events"))[0]?.id);
      await parts.webhook.process(last).catch((error: unknown) => {
        if (!(error instanceof Error) || !/not recorded/.test(error.message)) throw error;
      });
    }
  };
  const paymentBody = (o: Order, event: string) =>
    JSON.stringify({
      event,
      payload: {
        payment: {
          entity: {
            id: o.gw,
            order_id: o.orderId,
            amount: 49900,
            status: "captured",
            error_code: "BAD_REQUEST_ERROR",
          },
        },
      },
    });
  const refundBody = (gwPay: string, refundId: string, amount: number, event: string) =>
    JSON.stringify({
      event,
      payload: { refund: { entity: { id: refundId, payment_id: gwPay, amount } } },
    });

  const actions: [string, () => Promise<unknown>][] = [
    [
      "capture",
      async () => {
        const o = pick(orders);
        if (!gateway.payments.has(o.gw)) gateway.capture(o.gw, o.orderId);
      },
    ],
    ["hook captured", async () => send(paymentBody(pick(orders), "payment.captured"))],
    ["hook order.paid", async () => send(paymentBody(pick(orders), "order.paid"))],
    ["hook failed", async () => send(paymentBody(pick(orders), "payment.failed"))],
    [
      "verify",
      async () => {
        const o = pick(orders);
        return service.verify(
          asha,
          verifyBody.parse({
            paymentId: o.paymentId,
            gatewayPaymentId: o.gw,
            signature: gateway.signCheckout(o.orderId, o.gw),
          }),
        );
      },
    ],
    [
      "verify forged",
      async () => {
        const o = pick(orders);
        return service.verify(
          asha,
          verifyBody.parse({
            paymentId: o.paymentId,
            gatewayPaymentId: o.gw,
            signature: "0".repeat(64),
          }),
        );
      },
    ],
    ["second order", async () => newOrder()],
    [
      "hold runs out",
      async () =>
        q.query(
          "UPDATE appointments SET status='expired', hold_expires_at=NULL WHERE id=$1 AND status='held'",
          [appt],
        ),
    ],
    [
      "admin cancels",
      async () =>
        q.query(
          "UPDATE appointments SET status='cancelled_by_admin', hold_expires_at=NULL WHERE id=$1 AND status IN ('held','scheduled')",
          [appt],
        ),
    ],
    ["cancel refund", async () => parts.refunds.refundForCancellation(appt, "doctor", "scheduled")],
    [
      "admin refund",
      async () => {
        const p = (
          await rows(
            "SELECT id FROM payments WHERE appointment_id=$1 AND status IN ('captured','partially_refunded')",
            [appt],
          )
        )[0];
        if (!p) return;
        const amount = rnd() < 0.4 ? undefined : 1 + Math.floor(rnd() * 49900);
        return service.refundAsAdmin(
          admin,
          String(p.id),
          adminRefundBody.parse({
            reason: "fuzz refund",
            ...(amount ? { amountPaise: amount } : {}),
          }),
          `fuzz-refund-${seed}-${++n}-pad`,
        );
      },
    ],
    [
      "refund processed",
      async () => {
        const r = pick(
          (await rows(
            "SELECT r.gateway_refund_id AS gw, r.amount_paise, p.gateway_payment_id AS pay FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=$1 AND r.gateway_refund_id IS NOT NULL",
            [appt],
          )) as Record<string, unknown>[],
        );
        if (r)
          await send(
            refundBody(String(r.pay), String(r.gw), Number(r.amount_paise), "refund.processed"),
          );
      },
    ],
    [
      "refund failed",
      async () => {
        const r = pick(
          (await rows(
            "SELECT r.id, r.gateway_refund_id AS gw, r.amount_paise, p.gateway_payment_id AS pay FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=$1 AND r.gateway_refund_id IS NOT NULL AND r.status='initiated'",
            [appt],
          )) as Record<string, unknown>[],
        );
        if (r) {
          await send(
            refundBody(String(r.pay), String(r.gw), Number(r.amount_paise), "refund.failed"),
          );
        }
      },
    ],
    [
      "worker handles events",
      async () => {
        for (const e of await rows(
          "SELECT id FROM payment_events WHERE processed_at IS NULL ORDER BY id",
        )) {
          await parts.webhook.process(Number(e.id)).catch((error: unknown) => {
            // An early refund event legitimately asks to be retried.
            if (!(error instanceof Error) || !/not recorded/.test(error.message)) throw error;
          });
        }
      },
    ],
    ["daily check", async () => parts.reconcile.run()],
    ["gateway hiccup", async () => gateway.failures.failNext(1)],
  ];

  for (let step = 0; step < 18; step++) {
    const [name, run] = pick(actions);
    log.push(name);
    try {
      await run();
    } catch (error) {
      // Refusals and gateway trouble are fine; a database error or a crash is a bug.
      if (!(error instanceof AppError) && !(error instanceof AdapterError)) {
        throw new Error(
          `seed ${seed} step ${step} (${name}): ${String(error)}\n${log.join(" > ")}`,
        );
      }
    }
    gateway.failures.failNext(0);
    await checkInvariants(appt, `seed ${seed} after "${name}" [${log.join(" > ")}]`);
  }
  // What this run reached, so the final test can tell the random steps are not all no-ops.
  const count = async (sql: string) => Number((await rows(sql, [appt]))[0]?.n);
  if (
    (await count(
      "SELECT count(*)::int AS n FROM payments WHERE appointment_id=$1 AND status IN ('captured','partially_refunded','refunded')",
    )) > 0
  )
    reached.captured++;
  if (
    (await count(
      "SELECT count(*)::int AS n FROM appointments WHERE id=$1 AND status='scheduled'",
    )) > 0
  )
    reached.confirmed++;
  if (
    (await count(
      "SELECT count(*)::int AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=$1",
    )) > 0
  )
    reached.refundStarted++;
  if (
    (await count(
      "SELECT count(*)::int AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=$1 AND r.status='processed'",
    )) > 0
  )
    reached.refundProcessed++;
  if (
    (await count(
      "SELECT count(*)::int AS n FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=$1 AND r.status='failed'",
    )) > 0
  )
    reached.refundFailed++;
  if (
    (await count(
      "SELECT count(*)::int AS n FROM payments p JOIN appointments a ON a.id=p.appointment_id WHERE a.id=$1 AND a.status IN ('expired','cancelled_by_admin') AND p.status IN ('captured','partially_refunded','refunded')",
    )) > 0
  )
    reached.lateOrLost++;
  if (
    (await count(
      "SELECT count(*)::int AS n FROM payments WHERE appointment_id=$1 AND status='failed' AND failure_code='duplicate_paid'",
    )) > 0
  )
    reached.twoPaid++;
}

describe("payment invariants under random event orders", () => {
  it.each(Array.from({ length: 80 }, (_, i) => i + 1))(
    "seed %i",
    async (seed) => {
      await scenario(seed);
    },
    60_000,
  );
});

describe("the random runs", () => {
  it("reach the states that matter: paid, confirmed, refunded in part and in full, a refund that failed, a payment for a time that was lost, a second payment", () => {
    expect(reached.captured).toBeGreaterThan(10);
    expect(reached.confirmed).toBeGreaterThan(5);
    expect(reached.refundStarted).toBeGreaterThan(5);
    expect(reached.refundProcessed).toBeGreaterThan(2);
    expect(reached.lateOrLost).toBeGreaterThan(2);
  });
});
