import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import type { Principal } from "../identity/policy";
import { splitPayment } from "./ledger";
import { PaymentService } from "./service";
import { createPaymentServices } from "./wiring";
import { verifyBody } from "./schemas";

// The earnings ledger and the daily reconciliation (P5-06).
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

async function person(): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles: ["patient"] };
}

/** A held appointment, an order for it, and (when `pay`) a captured and settled payment. */
async function booking(opts: { pay?: boolean; fee?: number } = {}) {
  const appt = uuidv7();
  const start = new Date(Date.UTC(2033, 0, 1) + ++n * 3_600_000);
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'held',$7, now() + interval '10 minutes')`,
    [
      appt,
      patientId,
      doctorId,
      asha.userId,
      start,
      new Date(start.getTime() + 1_800_000),
      opts.fee ?? 49900,
    ],
  );
  const order = await service.createOrder(
    asha,
    { appointmentId: appt },
    `ledger-key-${++n}-padding`,
  );
  const gatewayPaymentId = `pay_${String(++n).padStart(8, "0")}`;
  if (opts.pay !== false) {
    gateway.capture(gatewayPaymentId, order.orderId);
    await service.verify(
      asha,
      verifyBody.parse({
        paymentId: order.paymentId,
        gatewayPaymentId,
        signature: gateway.signCheckout(order.orderId, gatewayPaymentId),
      }),
    );
  }
  return { appt, order, gatewayPaymentId };
}
const entries = async (paymentId: string) =>
  (
    await q.query(
      "SELECT entry_type, amount_paise FROM earnings_ledger WHERE payment_id=$1 ORDER BY entry_type",
      [paymentId],
    )
  ).rows.map((r) => [String(r.entry_type), Number(r.amount_paise)]);

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
  });
  asha = await person();
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

describe("splitPayment", () => {
  it("rounds the fee down and gives the doctor the rest, so the two always add up", () => {
    for (const amount of [1, 99, 100, 49900, 49999, 123457, 2_000_000]) {
      for (const bps of [0, 1, 333, 1000, 1500, 9999, 10_000]) {
        const s = splitPayment(amount, bps);
        expect(s.platformFeePaise + s.doctorSharePaise, `${amount}@${bps}`).toBe(amount);
        expect(s.platformFeePaise).toBe(Math.floor((amount * bps) / 10_000));
        expect(s.doctorSharePaise).toBeGreaterThanOrEqual(0);
      }
    }
    expect(splitPayment(49900, 1000)).toEqual({ platformFeePaise: 4990, doctorSharePaise: 44910 });
    expect(splitPayment(101, 1000)).toEqual({ platformFeePaise: 10, doctorSharePaise: 91 });
  });
  it("refuses amounts and rates that make no sense", () => {
    for (const [a, b] of [
      [0, 1000],
      [-5, 1000],
      [10.5, 1000],
      [100, -1],
      [100, 10_001],
      [100, 1.5],
    ] as const) {
      expect(() => splitPayment(a, b), `${a}/${b}`).toThrow();
    }
  });
});

describe("the ledger on capture", () => {
  it("writes the fee and the doctor's share once, and they add up to the payment", async () => {
    const b = await booking();
    expect(await entries(b.order.paymentId)).toEqual([
      ["doctor_share", 44910],
      ["platform_fee", 4990],
    ]);
    // Verify again, and a re-run of the hook: still two entries.
    await parts.settlement.settle(
      (await parts.repo.findById(b.order.paymentId))!,
      b.gatewayPaymentId,
    );
    expect(await entries(b.order.paymentId)).toHaveLength(2);
  });

  it("with a rate of zero the doctor gets everything", async () => {
    feeBps = 0;
    const b = await booking();
    expect(await entries(b.order.paymentId)).toEqual([
      ["doctor_share", 49900],
      ["platform_fee", 0],
    ]);
  });

  it("an unpaid order has no entries", async () => {
    const b = await booking({ pay: false });
    expect(await entries(b.order.paymentId)).toEqual([]);
  });

  it("a payment for a time that was lost is still booked as money received, then refunded", async () => {
    const b = await booking({ pay: false });
    await q.query(
      "UPDATE appointments SET status='cancelled_by_admin', hold_expires_at=NULL WHERE id=$1",
      [b.appt],
    );
    gateway.capture(b.gatewayPaymentId, b.order.orderId);
    await service.verify(
      asha,
      verifyBody.parse({
        paymentId: b.order.paymentId,
        gatewayPaymentId: b.gatewayPaymentId,
        signature: gateway.signCheckout(b.order.orderId, b.gatewayPaymentId),
      }),
    );
    expect((await entries(b.order.paymentId)).map((e) => e[0])).toEqual([
      "doctor_share",
      "platform_fee",
    ]);
    const refunds = await q.query("SELECT amount_paise FROM refunds WHERE payment_id=$1", [
      b.order.paymentId,
    ]);
    expect(refunds.rows.map((r) => Number(r.amount_paise))).toEqual([49900]);
  });

  it("the ledger cannot be changed or removed, even by the application's own role", async () => {
    const b = await booking();
    await expect(
      q.query("UPDATE earnings_ledger SET amount_paise = 1 WHERE payment_id=$1", [
        b.order.paymentId,
      ]),
    ).rejects.toThrow();
    await expect(
      q.query("DELETE FROM earnings_ledger WHERE payment_id=$1", [b.order.paymentId]),
    ).rejects.toThrow();
  });

  it("a doctor's balance is what the ledger owes them, not the platform's fee", async () => {
    await booking();
    await booking({ fee: 30000 });
    expect(await parts.ledgerRepo.doctorBalance(doctorId)).toBe(44910 + 27000);
  });
});

describe("reconciliation", () => {
  const old = (paymentId: string) =>
    q.query("UPDATE payments SET captured_at = now() - interval '1 hour' WHERE id=$1", [paymentId]);

  it("a clean day reports nothing wrong", async () => {
    const b = await booking();
    await old(b.order.paymentId);
    const report = await parts.reconcile.run();
    expect(report).toMatchObject({
      ledgerRepaired: 0,
      missingLedger: 0,
      unbalanced: 0,
      paidWithoutBooking: 0,
      stuckRefunds: 0,
      gatewayMismatch: 0,
      gatewayUnreachable: false,
    });
    expect(report.gatewayChecked).toBeGreaterThanOrEqual(1);
  });

  it("repairs a capture whose ledger entries were never written, and says so", async () => {
    const b = await booking({ pay: false });
    // Money arrived and the payment is marked captured, but the process died before the ledger.
    await parts.repo.markCaptured(b.order.paymentId, b.gatewayPaymentId);
    gateway.capture(b.gatewayPaymentId, b.order.orderId);
    await old(b.order.paymentId);
    expect(await entries(b.order.paymentId)).toEqual([]);
    const report = await parts.reconcile.run();
    expect(report.ledgerRepaired).toBeGreaterThanOrEqual(1);
    expect(report.missingLedger).toBe(0);
    expect(await entries(b.order.paymentId)).toEqual([
      ["doctor_share", 44910],
      ["platform_fee", 4990],
    ]);
    // The next run finds nothing to repair.
    expect((await parts.reconcile.run()).ledgerRepaired).toBe(0);
  });

  it("a very recent capture is left alone (its job may still be running)", async () => {
    const b = await booking({ pay: false });
    await parts.repo.markCaptured(b.order.paymentId, b.gatewayPaymentId);
    expect((await parts.reconcile.run()).missingLedger).toBe(0);
    expect(await entries(b.order.paymentId)).toEqual([]);
  });

  it("notices money kept for a time that was never booked, with no refund", async () => {
    const b = await booking({ pay: false });
    await parts.repo.markCaptured(b.order.paymentId, b.gatewayPaymentId);
    gateway.capture(b.gatewayPaymentId, b.order.orderId);
    await old(b.order.paymentId);
    const report = await parts.reconcile.run();
    expect(report.paidWithoutBooking).toBeGreaterThanOrEqual(1);
  });

  it("notices a refund that never reached the gateway", async () => {
    const b = await booking();
    await q.query(
      `INSERT INTO refunds (id, payment_id, amount_paise, reason, status, idempotency_key, created_at)
       VALUES ($1,$2,100,'stuck refund','initiated',$3, now() - interval '1 hour')`,
      [uuidv7(), b.order.paymentId, `stuck-refund-${uuidv7()}`],
    );
    expect((await parts.reconcile.run()).stuckRefunds).toBeGreaterThanOrEqual(1);
  });

  it("notices when the gateway disagrees about a payment", async () => {
    const b = await booking();
    await old(b.order.paymentId);
    // The gateway now says the payment was for a different amount.
    const live = gateway.payments.get(b.gatewayPaymentId)!;
    live.amountPaise = 100;
    expect((await parts.reconcile.run()).gatewayMismatch).toBeGreaterThanOrEqual(1);
    live.amountPaise = 49900;
    live.status = "failed";
    expect((await parts.reconcile.run()).gatewayMismatch).toBeGreaterThanOrEqual(1);
    live.status = "captured";
  });

  it("a gateway outage is reported, not fatal, and the other checks still run", async () => {
    const b = await booking();
    await old(b.order.paymentId);
    gateway.failures.failNext(5);
    const report = await parts.reconcile.run();
    expect(report.gatewayUnreachable).toBe(true);
    expect(report.unbalanced).toBe(0);
    gateway.failures.failNext(0);
  });

  it("notices signed gateway events nobody handled", async () => {
    await q.query(
      `INSERT INTO payment_events (gateway_event_id, event_type, payload, signature_ok, received_at)
       VALUES ($1,'payment.captured','{}'::jsonb,true, now() - interval '1 hour')`,
      [`evt_${uuidv7()}`],
    );
    expect((await parts.reconcile.run()).staleEvents).toBeGreaterThanOrEqual(1);
  });
});
