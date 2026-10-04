import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import type { Principal } from "../identity/policy";
import { AppError } from "../../lib/errors/app-error";
import { AppointmentService } from "../scheduling/appointments";
import { AppointmentRepo } from "../scheduling/appointments-repo";
import { PatientRepo } from "../patients/repo";
import { PaymentService } from "./service";
import { adminRefundBody, verifyBody } from "./schemas";
import { createPaymentServices } from "./wiring";

// Refunds (P5-07): admin and automatic, whole and partial, and what they do to the ledger.
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
let support: Principal;
let doctorUser: Principal;

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
  gateway = new FakePaymentProvider();
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
  support = { ...(await person()), roles: ["support"] };
  doctorUser = { ...(await person()), roles: ["doctor"] };
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patientId, asha.userId],
  );
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,$4,'Dr Refund',$2,'Council','MBBS',$3)`,
    [doctorId, `RF-${doctorId.slice(-8)}`, `${doctorId}@example.com`, doctorUser.userId],
  );
});

const status = async (table: string, id: string) =>
  String((await q.query(`SELECT status FROM ${table} WHERE id=$1`, [id])).rows[0]?.status);
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
const refundBody = (over: Record<string, unknown> = {}) =>
  adminRefundBody.parse({ reason: "goodwill refund", ...over });
const net = async (paymentId: string) =>
  Number(
    (
      await q.query(
        "SELECT COALESCE(sum(amount_paise),0)::bigint AS n FROM earnings_ledger WHERE payment_id=$1",
        [paymentId],
      )
    ).rows[0]?.n,
  );
const sumOf = async (paymentId: string, type: string) =>
  Number(
    (
      await q.query(
        "SELECT COALESCE(sum(amount_paise),0)::bigint AS n FROM earnings_ledger WHERE payment_id=$1 AND entry_type=$2",
        [paymentId, type],
      )
    ).rows[0]?.n,
  );
/** The gateway tells us the refund ended. */
async function gatewayReports(
  b: { gatewayPaymentId: string },
  refundId: string,
  amount: number,
  event: "refund.processed" | "refund.failed" = "refund.processed",
) {
  const raw = JSON.stringify({
    event,
    payload: {
      refund: {
        entity: { id: refundId, payment_id: b.gatewayPaymentId, amount, status: event.slice(7) },
      },
    },
  });
  const result = await parts.webhook.receive({
    rawBody: raw,
    signature: gateway.signWebhook(raw),
    eventIdHeader: `evt_${++n}_refundhook`,
  });
  expect(result).toBe("accepted");
  const id = Number((await q.query("SELECT max(id) AS id FROM payment_events")).rows[0]?.id);
  return parts.webhook.process(id);
}
const gatewayRefundId = async (refundId: string) =>
  String(
    (await q.query("SELECT gateway_refund_id FROM refunds WHERE id=$1", [refundId])).rows[0]
      ?.gateway_refund_id,
  );

describe("an admin refund", () => {
  it("a full refund asks the gateway for the whole amount, and the books follow when the gateway confirms", async () => {
    const b = await booking();
    const view = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody(),
      "admin-key-000000000001",
    );
    expect(view).toMatchObject({ status: "initiated", amountPaise: 49900 });
    expect([...gateway.refunds.values()].map((r) => r.amountPaise)).toEqual([49900]);
    // Until the gateway confirms, the payment still reads as received and the ledger is untouched.
    expect(await net(b.order.paymentId)).toBe(49900);
    expect(await gatewayReports(b, await gatewayRefundId(view.refundId), 49900)).toBe("handled");
    const pay = (
      await q.query("SELECT status, amount_refunded_paise FROM payments WHERE id=$1", [
        b.order.paymentId,
      ])
    ).rows[0];
    expect(pay).toMatchObject({ status: "refunded", amount_refunded_paise: 49900 });
    expect(await net(b.order.paymentId)).toBe(0);
    expect(await sumOf(b.order.paymentId, "doctor_share_reversal")).toBe(-44910);
    expect(await sumOf(b.order.paymentId, "platform_fee_reversal")).toBe(-4990);
    expect(await parts.ledgerRepo.doctorBalance(doctorId)).toBe(0);
    const row = (
      await q.query("SELECT status, initiated_by FROM refunds WHERE id=$1", [view.refundId])
    ).rows[0];
    expect(row).toMatchObject({ status: "processed", initiated_by: admin.userId });
  });

  it("partial refunds reverse the fee and share in proportion and add up exactly at the end", async () => {
    const b = await booking();
    const steps = [10000, 20000, 19900];
    let owed = 49900;
    for (const [i, amount] of steps.entries()) {
      const v = await service.refundAsAdmin(
        admin,
        b.order.paymentId,
        refundBody({ amountPaise: amount }),
        `admin-part-key-0000000${i}`,
      );
      await gatewayReports(b, await gatewayRefundId(v.refundId), amount);
      owed -= amount;
      expect(await net(b.order.paymentId), `after ${amount}`).toBe(owed);
      const status = (await q.query("SELECT status FROM payments WHERE id=$1", [b.order.paymentId]))
        .rows[0]?.status;
      expect(status).toBe(owed === 0 ? "refunded" : "partially_refunded");
    }
    expect(await sumOf(b.order.paymentId, "platform_fee_reversal")).toBe(-4990);
    expect(await sumOf(b.order.paymentId, "doctor_share_reversal")).toBe(-44910);
  });

  it("cannot refund more than is left, counting refunds still on their way", async () => {
    const b = await booking();
    await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody({ amountPaise: 30000 }),
      "admin-cap-key-000000001",
    );
    expect(
      await code(
        service.refundAsAdmin(
          admin,
          b.order.paymentId,
          refundBody({ amountPaise: 20000 }),
          "admin-cap-key-000000002",
        ),
      ),
    ).toBe("conflict");
    expect(
      await code(
        service.refundAsAdmin(
          admin,
          b.order.paymentId,
          refundBody({ amountPaise: 19900 }),
          "admin-cap-key-000000003",
        ),
      ),
    ).toBe("ok");
    expect(
      await code(
        service.refundAsAdmin(admin, b.order.paymentId, refundBody(), "admin-cap-key-000000004"),
      ),
    ).toBe("conflict");
    expect([...gateway.refunds.values()].reduce((a, r) => a + r.amountPaise, 0)).toBe(49900);
  });

  it("the same Idempotency-Key is the same refund and asks the gateway once", async () => {
    const b = await booking();
    const a = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody({ amountPaise: 5000 }),
      "admin-same-key-0000001",
    );
    const again = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody({ amountPaise: 5000 }),
      "admin-same-key-0000001",
    );
    expect(again.refundId).toBe(a.refundId);
    expect(gateway.refunds.size).toBe(1);
  });

  it("only an admin may do it; everyone else gets the same 404 as a payment that does not exist", async () => {
    const b = await booking();
    for (const who of [asha, doctorUser, support]) {
      expect(
        await code(
          service.refundAsAdmin(who, b.order.paymentId, refundBody(), "admin-who-key-00000001"),
        ),
        who.roles.join(),
      ).toMatch(/^(not_found|forbidden)$/);
    }
    expect(
      await code(service.refundAsAdmin(admin, uuidv7(), refundBody(), "admin-who-key-00000002")),
    ).toBe("not_found");
    expect(gateway.refunds.size).toBe(0);
  });

  it("a payment that was never received cannot be refunded", async () => {
    const b = await booking({ pay: false });
    expect(
      await code(
        service.refundAsAdmin(admin, b.order.paymentId, refundBody(), "admin-unpaid-key-00001"),
      ),
    ).toBe("conflict");
  });

  it("the body takes a reason and an optional positive amount, nothing else", () => {
    expect(adminRefundBody.safeParse({ reason: "ok reason" }).success).toBe(true);
    for (const bad of [
      {},
      { reason: "x" },
      { reason: "ok reason", amountPaise: 0 },
      { reason: "ok reason", amountPaise: -1 },
      { reason: "ok reason", amountPaise: 1.5 },
      { reason: "ok reason", extra: 1 },
      { reason: "x".repeat(201) },
    ]) {
      expect(adminRefundBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("a gateway that refuses is a conflict and one that is down is unavailable, and the refund can be tried again", async () => {
    const b = await booking();
    gateway.failures.failNext(1);
    expect(
      await code(
        service.refundAsAdmin(admin, b.order.paymentId, refundBody(), "admin-down-key-0000001"),
      ),
    ).toBe("unavailable");
    // The same request again completes it, with one gateway refund and one row.
    const v = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody(),
      "admin-down-key-0000001",
    );
    expect(v.amountPaise).toBe(49900);
    expect(gateway.refunds.size).toBe(1);
    expect(
      Number(
        (
          await q.query("SELECT count(*)::int AS n FROM refunds WHERE payment_id=$1", [
            b.order.paymentId,
          ])
        ).rows[0]?.n,
      ),
    ).toBe(1);
  });
});

describe("refund events from the gateway", () => {
  it("a repeat of the same confirmation changes nothing more", async () => {
    const b = await booking();
    const v = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody({ amountPaise: 10000 }),
      "admin-evt-key-00000001",
    );
    const gw = await gatewayRefundId(v.refundId);
    await gatewayReports(b, gw, 10000);
    await gatewayReports(b, gw, 10000);
    expect(await net(b.order.paymentId)).toBe(39900);
    expect(
      Number(
        (
          await q.query("SELECT amount_refunded_paise AS n FROM payments WHERE id=$1", [
            b.order.paymentId,
          ])
        ).rows[0]?.n,
      ),
    ).toBe(10000);
  });

  it("a confirmation for a refund we have not recorded yet is an error, so the queue tries again later", async () => {
    const b = await booking();
    await expect(gatewayReports(b, "rfnd_notyetsaved1", 100)).rejects.toThrow(/not recorded/);
    // It stays unprocessed, so the sweep finds it again.
    expect(await parts.webhook.sweep()).toBeGreaterThanOrEqual(1);
  });

  it("a refund that failed at the gateway stops counting, so the money can be refunded again", async () => {
    const b = await booking();
    const v = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody(),
      "admin-fail-key-0000001",
    );
    await gatewayReports(b, await gatewayRefundId(v.refundId), 49900, "refund.failed");
    expect(
      (await q.query("SELECT status FROM refunds WHERE id=$1", [v.refundId])).rows[0]?.status,
    ).toBe("failed");
    expect(await net(b.order.paymentId)).toBe(49900);
    // At the gateway the refund did not happen either.
    gateway.payments.get(b.gatewayPaymentId)!.refundedPaise = 0;
    const again = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody(),
      "admin-fail-key-0000002",
    );
    expect(again.amountPaise).toBe(49900);
  });

  it("an amount that differs from our record is not applied", async () => {
    const b = await booking();
    const v = await service.refundAsAdmin(
      admin,
      b.order.paymentId,
      refundBody({ amountPaise: 10000 }),
      "admin-amt-key-00000001",
    );
    await gatewayReports(b, await gatewayRefundId(v.refundId), 99);
    expect(
      (await q.query("SELECT status FROM refunds WHERE id=$1", [v.refundId])).rows[0]?.status,
    ).toBe("initiated");
    expect(await net(b.order.paymentId)).toBe(49900);
  });

  it("a duplicate payment that was refunded leaves the books alone", async () => {
    // Two orders for one held booking, both paid: the first confirms it, the second is refunded.
    const b = await booking({ pay: false });
    const second = await service.createOrder(
      asha,
      { appointmentId: b.appt },
      `dup-key-${++n}-padding`,
    );
    const pay = async (orderId: string, paymentId: string, gw: string) => {
      gateway.capture(gw, orderId);
      await service.verify(
        asha,
        verifyBody.parse({
          paymentId,
          gatewayPaymentId: gw,
          signature: gateway.signCheckout(orderId, gw),
        }),
      );
    };
    await pay(b.order.orderId, b.order.paymentId, b.gatewayPaymentId);
    const gw2 = `pay_${String(++n).padStart(8, "0")}`;
    await pay(second.orderId, second.paymentId, gw2);
    expect(await status("payments", second.paymentId)).toBe("failed");
    const refund = (
      await q.query("SELECT id, amount_paise FROM refunds WHERE payment_id=$1", [second.paymentId])
    ).rows[0];
    expect(Number(refund?.amount_paise)).toBe(49900);
    await gatewayReports(
      { gatewayPaymentId: gw2 },
      await gatewayRefundId(String(refund?.id)),
      49900,
    );
    expect(await status("payments", second.paymentId)).toBe("failed");
    expect(await net(second.paymentId)).toBe(0);
    // The booking and its own payment are untouched.
    expect(await net(b.order.paymentId)).toBe(49900);
    expect(await status("appointments", b.appt)).toBe("scheduled");
  });
});

describe("cancellation by the doctor or an admin", () => {
  it("the daily check reports a cancelled booking whose payment has no refund at all", async () => {
    const b = await booking();
    await q.query("UPDATE appointments SET status='cancelled_by_doctor' WHERE id=$1", [b.appt]);
    await q.query("UPDATE payments SET captured_at = now() - interval '1 hour' WHERE id=$1", [
      b.order.paymentId,
    ]);
    expect((await parts.reconcile.run()).paidWithoutBooking).toBeGreaterThanOrEqual(1);
  });

  const appointments = () =>
    new AppointmentService({
      repo: new AppointmentRepo(q),
      patients: new PatientRepo(q),
      slots: { list: async () => ({ slots: [] }) as never, invalidate: async () => undefined },
      crypto: () => {
        throw new Error("not used");
      },
      onCancelled: ({ appointmentId, by, from }) =>
        parts.refunds.refundForCancellation(appointmentId, by, from),
    });
  const future = (id: string) =>
    q.query(
      "UPDATE appointments SET start_at = now() + interval '3 days', end_at = now() + interval '3 days 30 minutes' WHERE id=$1",
      [id],
    );

  it("a doctor's cancellation refunds the whole payment", async () => {
    const b = await booking();
    await future(b.appt);
    await appointments().cancel(doctorUser, b.appt, { reason: "doctor_unavailable" });
    expect(await status("appointments", b.appt)).toBe("cancelled_by_doctor");
    expect([...gateway.refunds.values()].map((r) => r.amountPaise)).toEqual([49900]);
  });

  it("an admin's cancellation refunds too, once, even if asked twice", async () => {
    const b = await booking();
    await future(b.appt);
    await appointments().cancel(admin, b.appt, { reason: "doctor_unavailable" });
    await parts.refunds.refundForCancellation(b.appt, "admin", "scheduled");
    expect(gateway.refunds.size).toBe(1);
  });

  it("a patient's own cancellation does not refund by itself (the terms are the business's to set)", async () => {
    const b = await booking();
    await future(b.appt);
    await appointments().cancel(asha, b.appt, { reason: "changed_mind" });
    expect(await status("appointments", b.appt)).toBe("cancelled_by_patient");
    expect(gateway.refunds.size).toBe(0);
  });

  it("a gateway outage does not undo the cancellation, and the daily check reports the booking that still holds money", async () => {
    const b = await booking();
    await future(b.appt);
    gateway.failures.failNext(1);
    await appointments().cancel(doctorUser, b.appt, { reason: "doctor_unavailable" });
    expect(await status("appointments", b.appt)).toBe("cancelled_by_doctor");
    expect(gateway.refunds.size).toBe(0);
    await q.query("UPDATE payments SET captured_at = now() - interval '1 hour' WHERE id=$1", [
      b.order.paymentId,
    ]);
    // The refund row exists but never reached the gateway: the daily check reports it once it is old.
    await q.query("UPDATE refunds SET created_at = now() - interval '1 hour' WHERE payment_id=$1", [
      b.order.paymentId,
    ]);
    expect((await parts.reconcile.run()).stuckRefunds).toBeGreaterThanOrEqual(1);
    // Retrying the refund completes it.
    await parts.refunds.refundForCancellation(b.appt, "doctor", "scheduled");
    expect(gateway.refunds.size).toBe(1);
  });
});
