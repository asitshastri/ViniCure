import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import type { Principal } from "../identity/policy";
import { PaymentRepo } from "./repo";
import { MAX_ORDERS_PER_APPOINTMENT, createOrderBody } from "./schemas";
import { PaymentService, paymentKey } from "./service";

let q: Queryable;
let tx: TxRunner;
let gateway: FakePaymentProvider;
let service: PaymentService;
let asha: Principal;
let ravi: Principal;
let doctor: Principal;
let admin: Principal;
let doctorId: string;
let patientId: string;

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
async function held(feePaise = 49900, status = "held", expiresIn = "10 minutes") {
  const id = uuidv7();
  const start = new Date(Date.now() + (Math.floor(Math.random() * 1e6) + 1) * 3600_000);
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $7 = 'held' THEN now() + $9::interval END)`,
    [
      id,
      patientId,
      doctorId,
      asha.userId,
      start,
      new Date(start.getTime() + 1_800_000),
      status,
      feePaise,
      expiresIn,
    ],
  );
  return id;
}
const rows = async (appt: string) =>
  (
    await q.query(
      "SELECT amount_paise, gateway_order_id, status, payer_user_id FROM payments WHERE appointment_id=$1 ORDER BY created_at, id",
      [appt],
    )
  ).rows;

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
  service = new PaymentService({
    repo: new PaymentRepo(q, tx),
    gateway: () => gateway,
    publicKeyId: () => "rzp_test_public",
  });
  asha = await person();
  ravi = await person();
  doctor = await person(["doctor"]);
  admin = await person(["admin"]);
  doctorId = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status, applicant_email) VALUES ($1,'Dr Pay',$2,'Council','MBBS',49900,'approved','active',$3)`,
    [doctorId, `PAY-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
  );
  patientId = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patientId, asha.userId],
  );
});

describe("creating an order", () => {
  it("makes a gateway order for exactly the held fee and records it", async () => {
    const appt = await held(49900);
    const order = await service.createOrder(asha, { appointmentId: appt }, "key-aaaaaaaaaaaa");
    expect(order).toMatchObject({ amountPaise: 49900, currency: "INR", keyId: "rzp_test_public" });
    expect(gateway.orders.get(order.orderId)).toMatchObject({ amountPaise: 49900 });
    expect(await rows(appt)).toEqual([
      {
        amount_paise: 49900,
        gateway_order_id: order.orderId,
        status: "created",
        payer_user_id: asha.userId,
      },
    ]);
    expect(new Date(order.holdExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("the client cannot choose the amount: no amount field is accepted, and a changed doctor fee does not matter", async () => {
    expect(createOrderBody.safeParse({ appointmentId: uuidv7(), amountPaise: 1 }).success).toBe(
      false,
    );
    expect(
      createOrderBody.safeParse({ appointmentId: uuidv7(), amount: 1, currency: "INR" }).success,
    ).toBe(false);
    expect(createOrderBody.safeParse({ appointmentId: "x" }).success).toBe(false);
    const appt = await held(49900);
    // The doctor raises the fee after the slot was held: the held fee stands.
    await q.query("UPDATE doctors SET consultation_fee_paise = 99900 WHERE id = $1", [doctorId]);
    const order = await service.createOrder(asha, { appointmentId: appt }, "key-bbbbbbbbbbbb");
    expect(order.amountPaise).toBe(49900);
    expect(gateway.orders.get(order.orderId)?.amountPaise).toBe(49900);
  });

  it("the row can never disagree with the appointment's fee, even if written around the service", async () => {
    const appt = await held(49900);
    const repo = new PaymentRepo(q, tx);
    const wrong = await repo.createPayment({
      id: uuidv7(),
      appointmentId: appt,
      payerUserId: asha.userId,
      amountPaise: 100,
      gatewayOrderId: "order_wrong",
      idempotencyKey: "key-cccccccccccccccc",
    });
    expect(wrong).toBeNull();
    expect(await rows(appt)).toEqual([]);
  });

  it("the same Idempotency-Key gives the same order and one gateway order; a new key is a fresh attempt", async () => {
    const appt = await held();
    const first = await service.createOrder(asha, { appointmentId: appt }, "key-dddddddddddd");
    const again = await service.createOrder(asha, { appointmentId: appt }, "key-dddddddddddd");
    expect(again.orderId).toBe(first.orderId);
    expect(gateway.orders.size).toBe(1);
    const next = await service.createOrder(asha, { appointmentId: appt }, "key-eeeeeeeeeeee");
    expect(next.orderId).not.toBe(first.orderId);
    expect(await rows(appt)).toHaveLength(2);
  });

  it("two identical requests at the same moment make one payment", async () => {
    const appt = await held();
    const results = await Promise.allSettled([
      service.createOrder(asha, { appointmentId: appt }, "key-ffffffffffff"),
      service.createOrder(asha, { appointmentId: appt }, "key-ffffffffffff"),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await rows(appt)).toHaveLength(1);
    const ids = results.map(
      (r) => (r as PromiseFulfilledResult<{ orderId: string }>).value.orderId,
    );
    expect(new Set(ids).size).toBe(1);
  });

  it(`at most ${MAX_ORDERS_PER_APPOINTMENT} attempts for one appointment`, async () => {
    const appt = await held();
    for (let i = 0; i < MAX_ORDERS_PER_APPOINTMENT; i++) {
      await service.createOrder(asha, { appointmentId: appt }, `key-attempt-${i}-pad`);
    }
    expect(
      await code(service.createOrder(asha, { appointmentId: appt }, "key-attempt-extra-pad")),
    ).toBe("conflict");
    // A repeat of an earlier attempt is still answered.
    await service.createOrder(asha, { appointmentId: appt }, "key-attempt-0-pad");
  });

  it("the key is bound to the person and the appointment", () => {
    const a = paymentKey("u1", "a1", "k");
    expect(paymentKey("u2", "a1", "k")).not.toBe(a);
    expect(paymentKey("u1", "a2", "k")).not.toBe(a);
    expect(paymentKey("u1", "a1", "k2")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("who and when", () => {
  it("another patient, a doctor, an admin and a missing appointment are all 404", async () => {
    const appt = await held();
    for (const who of [ravi, doctor, admin]) {
      expect(
        await code(service.createOrder(who, { appointmentId: appt }, "key-gggggggggggg")),
        who.roles.join(),
      ).toBe("not_found");
    }
    expect(
      await code(service.createOrder(asha, { appointmentId: uuidv7() }, "key-gggggggggggg")),
    ).toBe("not_found");
    expect(gateway.orders.size).toBe(0);
    expect(await rows(appt)).toEqual([]);
  });

  it("a limited session cannot pay", async () => {
    const appt = await held();
    expect(
      await code(
        service.createOrder(
          { ...asha, limited: true },
          { appointmentId: appt },
          "key-hhhhhhhhhhhh",
        ),
      ),
    ).toBe("step_up_required");
  });

  it("only a held, live appointment can be paid: not confirmed, cancelled, expired or run-out holds", async () => {
    for (const status of ["scheduled", "cancelled_by_patient", "expired", "completed"]) {
      const appt = await held(49900, status);
      expect(
        await code(service.createOrder(asha, { appointmentId: appt }, "key-iiiiiiiiiiii")),
        status,
      ).toBe("conflict");
    }
    const old = await held(49900, "held", "-1 minute");
    expect(await code(service.createOrder(asha, { appointmentId: old }, "key-jjjjjjjjjjjj"))).toBe(
      "conflict",
    );
    expect(gateway.orders.size).toBe(0);
  });

  it("a free booking has nothing to pay", async () => {
    const appt = await held(0);
    expect(await code(service.createOrder(asha, { appointmentId: appt }, "key-kkkkkkkkkkkk"))).toBe(
      "conflict",
    );
  });
});

describe("when the gateway is down", () => {
  it("answers 'unavailable', writes nothing, and works again afterwards", async () => {
    const appt = await held();
    gateway.failures.failNext();
    expect(await code(service.createOrder(asha, { appointmentId: appt }, "key-llllllllllll"))).toBe(
      "unavailable",
    );
    expect(await rows(appt)).toEqual([]);
    expect(
      (await service.createOrder(asha, { appointmentId: appt }, "key-llllllllllll")).amountPaise,
    ).toBe(49900);
  });
});
