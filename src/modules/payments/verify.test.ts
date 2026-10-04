import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import type { Principal } from "../identity/policy";
import { verifyBody } from "./schemas";
import { PaymentService } from "./service";
import { createPaymentServices } from "./wiring";

// The checkout "verify" step (P5-04): signature checked, then the gateway asked, then settled.
let q: Queryable;
let tx: TxRunner;
let gateway: FakePaymentProvider;
let parts: ReturnType<typeof createPaymentServices>;
let service: PaymentService;
let asha: Principal;
let ravi: Principal;
let doctor: Principal;
let patientId: string;
let doctorId: string;
let n = 0;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
async function person(roles: Role[] = ["patient"]): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
const status = async (table: string, id: string) =>
  String((await q.query(`SELECT status FROM ${table} WHERE id=$1`, [id])).rows[0]?.status);

async function checkout(opts: { hold?: string } = {}) {
  const appt = uuidv7();
  const start = new Date(Date.UTC(2032, 0, 1) + ++n * 3_600_000);
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'held',49900, now() + $7::interval)`,
    [
      appt,
      patientId,
      doctorId,
      asha.userId,
      start,
      new Date(start.getTime() + 1_800_000),
      opts.hold ?? "10 minutes",
    ],
  );
  const order = await service.createOrder(
    asha,
    { appointmentId: appt },
    `verify-key-${++n}-padding`,
  );
  const gatewayPaymentId = `pay_${String(++n).padStart(8, "0")}`;
  const signature = gateway.signCheckout(order.orderId, gatewayPaymentId);
  return { appt, order, gatewayPaymentId, signature, start };
}
const body = (c: Awaited<ReturnType<typeof checkout>>, over: Record<string, unknown> = {}) =>
  verifyBody.parse({
    paymentId: c.order.paymentId,
    gatewayPaymentId: c.gatewayPaymentId,
    signature: c.signature,
    ...over,
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
  gateway = new FakePaymentProvider();
  parts = createPaymentServices({
    feeBps: () => 0,
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
  ravi = await person();
  doctor = await person(["doctor"]);
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patientId, asha.userId],
  );
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,'Dr Verify',$2,'Council','MBBS',$3)`,
    [doctorId, `VF-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
  );
});

describe("verify", () => {
  it("a genuine, captured payment confirms the appointment", async () => {
    const c = await checkout();
    gateway.capture(c.gatewayPaymentId, c.order.orderId);
    expect(await service.verify(asha, body(c))).toEqual({ status: "paid", appointmentId: c.appt });
    expect(await status("appointments", c.appt)).toBe("scheduled");
    expect(await status("payments", c.order.paymentId)).toBe("captured");
    // Asking again is safe and says the same.
    expect((await service.verify(asha, body(c))).status).toBe("paid");
    expect(
      Number(
        (
          await q.query(
            "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='scheduled'",
            [c.appt],
          )
        ).rows[0]?.n,
      ),
    ).toBe(1);
  });

  it("a wrong signature is refused before the gateway is asked, and nothing changes", async () => {
    const c = await checkout();
    gateway.capture(c.gatewayPaymentId, c.order.orderId);
    for (const signature of [
      "0".repeat(64),
      gateway.signCheckout(c.order.orderId, "pay_someone_else"),
      gateway.signCheckout("order_other", c.gatewayPaymentId),
    ]) {
      expect(await code(service.verify(asha, body(c, { signature }))), signature).toBe(
        "validation_failed",
      );
    }
    expect(await status("payments", c.order.paymentId)).toBe("created");
    expect(await status("appointments", c.appt)).toBe("held");
  });

  it("the body shape is strict: no amount, no status", () => {
    const base = {
      paymentId: uuidv7(),
      gatewayPaymentId: "pay_abcdef12",
      signature: "a".repeat(64),
    };
    expect(verifyBody.safeParse(base).success).toBe(true);
    expect(verifyBody.safeParse({ ...base, amountPaise: 1 }).success).toBe(false);
    expect(verifyBody.safeParse({ ...base, status: "captured" }).success).toBe(false);
    expect(verifyBody.safeParse({ ...base, signature: "xyz" }).success).toBe(false);
    expect(verifyBody.safeParse({ ...base, gatewayPaymentId: "../../x" }).success).toBe(false);
  });

  it("someone else's payment, a doctor, and an unknown payment are all 404; a limited session cannot verify", async () => {
    const c = await checkout();
    gateway.capture(c.gatewayPaymentId, c.order.orderId);
    expect(await code(service.verify(ravi, body(c)))).toBe("not_found");
    expect(await code(service.verify(doctor, body(c)))).toBe("not_found");
    expect(await code(service.verify(asha, body(c, { paymentId: uuidv7() })))).toBe("not_found");
    expect(await code(service.verify({ ...asha, limited: true }, body(c)))).toBe(
      "step_up_required",
    );
    expect(await status("payments", c.order.paymentId)).toBe("created");
  });

  it("a genuine signature does not make an uncaptured payment count", async () => {
    const c = await checkout();
    gateway.payments.set(c.gatewayPaymentId, {
      orderId: c.order.orderId,
      amountPaise: 49900,
      status: "authorized",
      refundedPaise: 0,
    });
    expect(await service.verify(asha, body(c))).toMatchObject({ status: "pending" });
    expect(await status("appointments", c.appt)).toBe("held");
    expect(await status("payments", c.order.paymentId)).toBe("created");
  });

  it("a payment for a different amount than the order is a problem and changes nothing", async () => {
    const c = await checkout();
    gateway.payments.set(c.gatewayPaymentId, {
      orderId: c.order.orderId,
      amountPaise: 100,
      status: "captured",
      refundedPaise: 0,
    });
    expect(await service.verify(asha, body(c))).toMatchObject({ status: "problem" });
    expect(await status("appointments", c.appt)).toBe("held");
  });

  it("when the time was taken meanwhile, the answer is 'refunded' and a refund is started", async () => {
    const c = await checkout();
    await q.query(
      "UPDATE appointments SET status='cancelled_by_patient', hold_expires_at=NULL WHERE id=$1",
      [c.appt],
    );
    gateway.capture(c.gatewayPaymentId, c.order.orderId);
    expect(await service.verify(asha, body(c))).toMatchObject({ status: "refunded" });
    expect(gateway.refunds.size).toBe(1);
    expect(await status("appointments", c.appt)).toBe("cancelled_by_patient");
  });

  it("when the gateway is unreachable the answer is 'unavailable' and a retry succeeds", async () => {
    const c = await checkout();
    gateway.capture(c.gatewayPaymentId, c.order.orderId);
    gateway.failures.failNext();
    expect(await code(service.verify(asha, body(c)))).toBe("unavailable");
    expect(await status("appointments", c.appt)).toBe("held");
    expect((await service.verify(asha, body(c))).status).toBe("paid");
  });

  it("verify and the webhook in either order confirm once", async () => {
    for (const first of ["verify", "webhook"] as const) {
      const c = await checkout();
      gateway.capture(c.gatewayPaymentId, c.order.orderId);
      const event = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: c.gatewayPaymentId,
              order_id: c.order.orderId,
              amount: 49900,
              status: "captured",
            },
          },
        },
      });
      const ids: number[] = [];
      const hooked = createPaymentServices({
        feeBps: () => 0,
        db: q,
        tx,
        gateway: () => gateway,
        enqueue: async (id) => void ids.push(id),
      });
      const webhook = async () => {
        await hooked.webhook.receive({
          rawBody: event,
          signature: gateway.signWebhook(event),
          eventIdHeader: `evt_${first}_${n++}_xx`,
        });
        for (const id of ids) await hooked.webhook.process(id);
      };
      if (first === "verify") {
        await service.verify(asha, body(c));
        await webhook();
      } else {
        await webhook();
        await service.verify(asha, body(c));
      }
      expect(await status("appointments", c.appt)).toBe("scheduled");
      expect(
        Number(
          (
            await q.query(
              "SELECT count(*)::int AS n FROM appointment_status_history WHERE appointment_id=$1 AND to_status='scheduled'",
              [c.appt],
            )
          ).rows[0]?.n,
        ),
      ).toBe(1);
      expect(gateway.refunds.size).toBe(0);
    }
  });
});
