import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./testing";

// Constraints of the payment tables (migration 0017), exercised as the app role.
let t: Awaited<ReturnType<typeof createTestDb>>;
let n = 0;
const id = () => `0190a1b2-c3d4-7e5f-8a9b-${String(900000000000 + ++n)}`;
const key = () => `idem-${String(++n).padStart(20, "0")}`;
const rejects = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

async function fixture() {
  const user = id();
  await t.app.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    user,
    `${user}@example.com`,
  ]);
  const patient = id();
  await t.app.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [patient, user],
  );
  const doctor = id();
  await t.app.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,'Dr Pay',$2,'Council','MBBS',$3)`,
    [doctor, `PAY-${n}`, `${doctor}@example.com`],
  );
  const appt = id();
  const start = new Date(Date.UTC(2030, 0, 1) + n * 3_600_000);
  await t.app.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled',50000)`,
    [appt, patient, doctor, user, start, new Date(start.getTime() + 1_800_000)],
  );
  return { user, patient, doctor, appt };
}

async function payment(f: Awaited<ReturnType<typeof fixture>>, over: Record<string, unknown> = {}) {
  const pid = id();
  const row = { status: "created", refunded: 0, captured: null as string | null, ...over };
  await t.app.query(
    `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, amount_refunded_paise, status,
       gateway_order_id, idempotency_key, captured_at)
     VALUES ($1,$2,$3,50000,$4,$5,$6,$7,$8)`,
    [pid, f.appt, f.user, row.refunded, row.status, `order_${pid}`, key(), row.captured],
  );
  return pid;
}

describe("payments", () => {
  it("the amount is positive, in rupees only, and the status matches what was refunded", async () => {
    const f = await fixture();
    await rejects(
      t.app.query(
        `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, gateway_order_id, idempotency_key)
         VALUES ($1,$2,$3,0,'o1',$4)`,
        [id(), f.appt, f.user, key()],
      ),
      /payments_amount_check/,
    );
    await rejects(
      t.app.query(
        `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, currency, gateway_order_id, idempotency_key)
         VALUES ($1,$2,$3,100,'USD','o2',$4)`,
        [id(), f.appt, f.user, key()],
      ),
      /payments_currency_check/,
    );
    const cap = "2030-01-01T00:00:00Z";
    await payment(f, { status: "captured", captured: cap });
    await rejects(
      payment(f, { status: "refunded", refunded: 100, captured: cap }),
      /payments_refund_status_check/,
    );
    await rejects(
      payment(f, { status: "partially_refunded", refunded: 0, captured: cap }),
      /payments_refund_status_check/,
    );
    await rejects(
      payment(f, { status: "captured", refunded: 10, captured: cap }),
      /payments_refund_status_check/,
    );
    await rejects(payment(f, { status: "captured", captured: null }), /payments_captured_check/);
    await rejects(payment(f, { status: "created", captured: cap }), /payments_captured_check/);
  });

  it("an appointment can be paid for once; failed and open attempts do not count", async () => {
    const f = await fixture();
    const cap = "2030-01-01T00:00:00Z";
    await payment(f, { status: "failed" });
    await payment(f, { status: "created" });
    const paid = await payment(f, { status: "captured", captured: cap });
    await rejects(payment(f, { status: "captured", captured: cap }), /payments_one_paid_idx/);
    await rejects(
      payment(f, { status: "partially_refunded", refunded: 100, captured: cap }),
      /payments_one_paid_idx/,
    );
    // Once fully refunded, the appointment may be paid again.
    await t.app.query(
      "UPDATE payments SET status='refunded', amount_refunded_paise=50000 WHERE id=$1",
      [paid],
    );
    await payment(f, { status: "captured", captured: cap });
  });

  it("a repeated key, order or gateway payment cannot make a second payment", async () => {
    const f = await fixture();
    const first = await payment(f);
    const dup = (over: string) =>
      t.app.query(
        `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, gateway_order_id, idempotency_key, gateway_payment_id)
         VALUES ($1,$2,$3,50000,$4,$5,$6)`,
        over === "key"
          ? [id(), f.appt, f.user, "order_new_1", "idem-same-key-0000000001", null]
          : [id(), f.appt, f.user, `order_${first}`, key(), null],
      );
    await t.app.query(
      "UPDATE payments SET idempotency_key='idem-same-key-0000000001' WHERE id=$1",
      [first],
    );
    await rejects(dup("key"), /payments_idempotency_idx/);
    await rejects(dup("order"), /payments_order_idx/);
    await t.app.query("UPDATE payments SET gateway_payment_id='pay_1' WHERE id=$1", [first]);
    const second = await payment(f);
    await rejects(
      t.app.query("UPDATE payments SET gateway_payment_id='pay_1' WHERE id=$1", [second]),
      /payments_gateway_payment_idx/,
    );
  });

  it("a short idempotency key is refused", async () => {
    const f = await fixture();
    await rejects(
      t.app.query(
        `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, gateway_order_id, idempotency_key)
         VALUES ($1,$2,$3,100,'o9','short')`,
        [id(), f.appt, f.user],
      ),
      /payments_key_length_check/,
    );
  });
});

describe("payment events", () => {
  async function event(over: Record<string, unknown> = {}) {
    const eid = String(over.eventId ?? `evt_${++n}`);
    await t.app.query(
      `INSERT INTO payment_events (payment_id, gateway_event_id, event_type, payload, signature_ok)
       VALUES ($1,$2,'payment.captured','{"amount":50000}',true)`,
      [over.paymentId ?? null, eid],
    );
    return eid;
  }

  it("each gateway event id is stored once", async () => {
    const eid = await event();
    await rejects(event({ eventId: eid }), /payment_events_event_idx/);
  });

  it("only processed_at can change, once, and nothing can be deleted", async () => {
    const eid = await event();
    await t.app.query(
      "UPDATE payment_events SET processed_at = now() WHERE gateway_event_id = $1",
      [eid],
    );
    await rejects(
      t.app.query("UPDATE payment_events SET processed_at = now() WHERE gateway_event_id = $1", [
        eid,
      ]),
      /append-only|permission/,
    );
    for (const sql of [
      "UPDATE payment_events SET payload = '{}'",
      "UPDATE payment_events SET signature_ok = false",
      "UPDATE payment_events SET event_type = 'payment.failed'",
      "DELETE FROM payment_events",
      "TRUNCATE payment_events",
    ]) {
      await rejects(t.app.query(sql), /permission denied|append-only|must be owner/);
    }
    // Even the owner is stopped by the trigger.
    await rejects(t.db.query("UPDATE payment_events SET payload = '{}'"), /append-only/);
    await rejects(t.db.query("DELETE FROM payment_events"), /append-only/);
  });
});

describe("refunds", () => {
  it("amount, reason and processed time are checked, and a retry key is unique", async () => {
    const f = await fixture();
    const pid = await payment(f, { status: "captured", captured: "2030-01-01T00:00:00Z" });
    const refund = (
      amount: number,
      reason: string,
      status = "initiated",
      processed: string | null = null,
      k = key(),
    ) =>
      t.app.query(
        `INSERT INTO refunds (id, payment_id, amount_paise, reason, status, idempotency_key, processed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id(), pid, amount, reason, status, k, processed],
      );
    await refund(1000, "doctor cancelled");
    await rejects(refund(0, "doctor cancelled"), /refunds_amount_check/);
    await rejects(refund(100, "x"), /refunds_reason_check/);
    await rejects(refund(100, "doctor cancelled", "processed", null), /refunds_processed_check/);
    await rejects(
      refund(100, "doctor cancelled", "initiated", "2030-01-02T00:00:00Z"),
      /refunds_processed_check/,
    );
    await refund(100, "doctor cancelled", "processed", "2030-01-02T00:00:00Z");
  });
});

describe("the ledger", () => {
  it("is append-only, signed by type, and each capture and refund is booked once", async () => {
    const f = await fixture();
    const pid = await payment(f, { status: "captured", captured: "2030-01-01T00:00:00Z" });
    const entry = (type: string, amount: number, refundId: string | null = null) =>
      t.app.query(
        `INSERT INTO earnings_ledger (doctor_id, payment_id, refund_id, entry_type, amount_paise) VALUES ($1,$2,$3,$4,$5)`,
        [f.doctor, pid, refundId, type, amount],
      );
    await entry("doctor_share", 45000);
    await entry("platform_fee", 5000);
    await rejects(entry("doctor_share", 45000), /ledger_capture_once_idx/);
    await rejects(entry("doctor_share", -1, null), /ledger_sign_check|ledger_capture_once_idx/);
    await rejects(entry("platform_fee_reversal", -100, null), /ledger_refund_check/);
    const rid = id();
    await t.app.query(
      `INSERT INTO refunds (id, payment_id, amount_paise, reason, idempotency_key) VALUES ($1,$2,1000,'doctor cancelled',$3)`,
      [rid, pid, key()],
    );
    await rejects(entry("doctor_share_reversal", 900, rid), /ledger_sign_check/);
    await entry("doctor_share_reversal", -900, rid);
    await rejects(entry("doctor_share_reversal", -900, rid), /ledger_refund_once_idx/);
    for (const sql of [
      "UPDATE earnings_ledger SET amount_paise = 1",
      "DELETE FROM earnings_ledger",
      "TRUNCATE earnings_ledger",
    ]) {
      await rejects(t.app.query(sql), /permission denied|append-only|must be owner/);
    }
    await rejects(t.db.query("UPDATE earnings_ledger SET amount_paise = 1"), /append-only/);
    // The balance is the sum, so it can be checked.
    const sum = await t.app.query(
      "SELECT sum(amount_paise)::int AS s FROM earnings_ledger WHERE payment_id = $1 AND entry_type LIKE 'doctor%'",
      [pid],
    );
    expect(sum.rows[0]).toEqual({ s: 44100 });
  });
});

describe("invoices, payouts and referrals", () => {
  it("one invoice per payment with a unique number; payouts once per period; referred once", async () => {
    const f = await fixture();
    const pid = await payment(f, { status: "captured", captured: "2030-01-01T00:00:00Z" });
    const invoice = (no: string, tax = 0, p = pid) =>
      t.app.query(
        `INSERT INTO invoices (id, payment_id, invoice_no, financial_year, tax_paise, total_paise) VALUES ($1,$2,$3,'2029-30',$4,50000)`,
        [id(), p, no, tax],
      );
    const taken = `VC/2029-30/${++n}`;
    await invoice(taken);
    await rejects(invoice(`VC/2029-30/${++n}`), /invoices_payment_idx/);
    const g = await fixture();
    const pid2 = await payment(g, { status: "captured", captured: "2030-01-01T00:00:00Z" });
    await rejects(invoice(taken, 0, pid2), /invoices_no_idx/);
    await rejects(invoice("VC/2029-30/x", 60000, pid2), /invoices_amount_check/);
    await rejects(
      t.app.query("INSERT INTO invoice_counters (financial_year) VALUES ('2029')"),
      /invoice_counters_year_check/,
    );

    const payout = (
      status = "processing",
      paidOn: string | null = null,
      start = "2030-01-01",
      end = "2030-01-31",
    ) =>
      t.app.query(
        `INSERT INTO payouts (id, doctor_id, amount_paise, status, period_start, period_end, paid_on) VALUES ($1,$2,1000,$3,$4,$5,$6)`,
        [id(), f.doctor, status, start, end, paidOn],
      );
    await payout();
    await rejects(payout(), /payouts_period_idx/);
    await rejects(payout("paid", null, "2030-02-01", "2030-02-28"), /payouts_paid_check/);
    await rejects(payout("processing", null, "2030-03-31", "2030-03-01"), /payouts_period_check/);
    await payout("paid", "2030-03-05", "2030-02-01", "2030-02-28");

    const a = f.user;
    const b = g.user;
    const referral = (from: string, to: string) =>
      t.app.query(
        "INSERT INTO referrals (id, referrer_user_id, referred_user_id) VALUES ($1,$2,$3)",
        [id(), from, to],
      );
    await referral(a, b);
    await rejects(referral(b, b), /referrals_self_check/);
    await rejects(referral(g.user, b), /referrals_self_check|referrals_referred_idx/);
    const c = (await fixture()).user;
    await rejects(referral(c, b), /referrals_referred_idx/);
  });
});
