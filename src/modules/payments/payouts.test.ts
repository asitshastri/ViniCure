import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import type { Principal } from "../identity/policy";
import { AppError } from "../../lib/errors/app-error";
import { PayoutRepo } from "./payout-repo";
import {
  PayoutService,
  csvCell,
  istToday,
  markPaidBody,
  payoutPeriodBody,
  payoutsCsv,
  rupees,
} from "./payouts";
import { PaymentService } from "./service";
import { verifyBody } from "./schemas";
import { createPaymentServices } from "./wiring";

// Payouts (P5-09): claiming balances, the CSV, marking paid.
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
let payouts: PayoutService;
let nowMs = Date.now();
let doctorB: string;
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
  nowMs = Date.now() + 3 * 86_400_000;
  payouts = new PayoutService({ repo: new PayoutRepo(q, tx), now: () => nowMs });
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
  doctorB = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
     VALUES ($1,'=Formula Dr',$2,'Council','MBBS',$3)`,
    [doctorB, `PB-${doctorB.slice(-8)}`, `${doctorB}@example.com`],
  );
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
const status = async (table: string, id: string) =>
  String((await q.query(`SELECT status FROM ${table} WHERE id=$1`, [id])).rows[0]?.status);
const day = (offset: number) => istToday(Date.now() + offset * 86_400_000);
/** A finished period that includes everything made in these tests (they run "three days from now"). */
const period = () => ({ periodStart: day(0), periodEnd: day(1) });
const balance = (id: string) => parts.ledgerRepo.doctorBalance(id);

/** Two shares for doctor A and one for doctor B. */
async function earnings() {
  const a1 = await booking();
  const a2 = await booking();
  const saved = doctorId;
  doctorId = doctorB;
  const b1 = await booking();
  doctorId = saved;
  return { a1, a2, b1, a: saved, b: doctorB };
}

describe("spreadsheet safety", () => {
  it("a cell that starts like a formula is made plain text, and special characters are quoted", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvCell("Asha, MD")).toBe('"Asha, MD"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(44910)).toBe("44910");
    expect(csvCell("Plain Name")).toBe("Plain Name");
  });
  it("amounts are whole paise, shown in rupees without rounding", () => {
    expect(rupees(44910)).toBe("449.10");
    expect(rupees(5)).toBe("0.05");
    expect(rupees(100)).toBe("1.00");
  });
  it("the file has a header and one line per payout, nothing about bank or contact", () => {
    const csv = payoutsCsv([
      {
        id: "p1",
        doctorId: "d1",
        doctorName: "=Evil",
        registrationNo: "R1",
        amountPaise: 44910,
        status: "processing",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        paidOn: null,
        note: null,
      },
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "payout_id,doctor_id,doctor_name,registration_no,period_start,period_end,amount_inr,amount_paise,status",
    );
    expect(lines[1]).toBe("p1,d1,'=Evil,R1,2026-09-01,2026-09-30,449.10,44910,processing");
    expect(csv.toLowerCase()).not.toMatch(/bank|account|ifsc|email|phone/);
  });
});

describe("claiming balances", () => {
  it("each doctor is paid what the ledger owes them, once, and the claim leaves their balance at zero", async () => {
    const e = await earnings();
    expect(await balance(e.a)).toBe(89820);
    expect(await balance(e.b)).toBe(44910);
    const out = await payouts.create(admin, period());
    const mine = out.created.filter((p) => p.doctorId === e.a || p.doctorId === e.b);
    expect(mine.map((p) => [p.doctorId === e.a ? "A" : "B", p.amountPaise]).sort()).toEqual([
      ["A", 89820],
      ["B", 44910],
    ]);
    expect(await balance(e.a)).toBe(0);
    expect(await balance(e.b)).toBe(0);
    for (const p of mine) expect(p.status).toBe("processing");
    // The same period again, or another period overlapping it, claims nothing more.
    expect((await payouts.create(admin, period())).created).toEqual([]);
    expect(
      (await payouts.create(admin, { periodStart: day(0), periodEnd: day(2) })).created.filter(
        (p) => p.doctorId === e.a,
      ),
    ).toEqual([]);
  });

  it("only what was earned before the end of the period is claimed", async () => {
    const e = await earnings();
    // A period that ended days ago: today's shares are not in it.
    nowMs = Date.now();
    const out = await payouts.create(admin, { periodStart: day(-30), periodEnd: day(-1) });
    expect(out.created.filter((p) => p.doctorId === e.a || p.doctorId === e.b)).toEqual([]);
    expect(await balance(e.a)).toBe(89820);
  });

  it("a refund after a payout is taken off the next payout, and nothing is paid while the doctor owes", async () => {
    const e = await earnings();
    await payouts.create(admin, period());
    // One of A's payments is refunded after A was paid: the balance goes negative.
    const refund = await parts.refunds.refund((await parts.repo.findById(e.a1.order.paymentId))!, {
      purpose: "late",
      reason: "refund after payout",
      amountPaise: null,
      initiatedBy: null,
    });
    await parts.repo.completeRefund(refund!.id);
    expect(await balance(e.a)).toBe(-44910);
    nowMs += 5 * 86_400_000;
    const later = { periodStart: day(0), periodEnd: day(6) };
    expect((await payouts.create(admin, later)).created.filter((p) => p.doctorId === e.a)).toEqual(
      [],
    );
    // A new booking brings the balance back to zero, which still pays nothing.
    const saved = doctorId;
    doctorId = e.a;
    await booking();
    doctorId = saved;
    expect(await balance(e.a)).toBe(0);
    nowMs += 86_400_000;
    expect(
      (await payouts.create(admin, { periodStart: day(0), periodEnd: day(7) })).created.filter(
        (p) => p.doctorId === e.a,
      ),
    ).toEqual([]);
  });

  it("the period must be real, finished, in order and at most a year", async () => {
    for (const bad of [
      { periodStart: "2026-02-30", periodEnd: "2026-03-01" },
      { periodStart: day(1), periodEnd: day(0) },
      { periodStart: day(0), periodEnd: day(3) }, // "today" in these tests is day 3: not over yet
      { periodStart: "2020-01-01", periodEnd: "2022-01-01" },
    ]) {
      expect(await code(payouts.create(admin, bad)), JSON.stringify(bad)).toBe("validation_failed");
    }
    expect(
      payoutPeriodBody.safeParse({ periodStart: "26-1-1", periodEnd: "2026-01-02" }).success,
    ).toBe(false);
    expect(
      payoutPeriodBody.safeParse({ periodStart: "2026-01-01", periodEnd: "2026-01-02", extra: 1 })
        .success,
    ).toBe(false);
  });

  it("only an admin may claim, export or settle; everyone else gets 404", async () => {
    await earnings();
    for (const who of [asha, doctorUser, support]) {
      const roles = who.roles.join();
      expect(await code(payouts.create(who, period())), roles).toBe("not_found");
      expect(await code(payouts.exportCsv(who, period())), roles).toBe("not_found");
      expect(await code(payouts.markPaid(who, uuidv7(), { paidOn: day(0) })), roles).toBe(
        "not_found",
      );
    }
  });

  it("a payout's ledger entry names the payout, and no other entry may", async () => {
    await expect(
      q.query(
        "INSERT INTO earnings_ledger (doctor_id, entry_type, amount_paise) VALUES ($1,'payout',-1)",
        [doctorId],
      ),
    ).rejects.toThrow();
    const e = await earnings();
    const made = await payouts.create(admin, period());
    const payoutId = made.created.find((p) => p.doctorId === e.a)!.payoutId;
    await expect(
      q.query(
        "INSERT INTO earnings_ledger (doctor_id, payment_id, payout_id, entry_type, amount_paise) VALUES ($1,$2,$3,'doctor_share',1)",
        [e.a, e.a1.order.paymentId, payoutId],
      ),
    ).rejects.toThrow();
    // The same payout cannot take money from the balance twice.
    await expect(
      q.query(
        "INSERT INTO earnings_ledger (doctor_id, payout_id, entry_type, amount_paise) VALUES ($1,$2,'payout',-1)",
        [e.a, payoutId],
      ),
    ).rejects.toThrow();
  });
});

describe("the settlement file and marking paid", () => {
  it("the export lists the period's payouts, and only that period", async () => {
    const e = await earnings();
    await payouts.create(admin, period());
    const csv = await payouts.exportCsv(admin, period());
    const lines = csv.trimEnd().split("\r\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(csv).toContain(`,${e.a},`);
    // Doctor B's name starts with "=": it is text in the file.
    expect(csv).toContain("'=Formula Dr");
    expect(csv).toContain(",89820,processing");
    expect(
      await payouts.exportCsv(admin, { periodStart: day(-30), periodEnd: day(-20) }),
    ).not.toContain(e.a);
  });

  it("marking paid works once, with a real date that is not in the future", async () => {
    const e = await earnings();
    const made = await payouts.create(admin, period());
    const id = made.created.find((p) => p.doctorId === e.b)!.payoutId;
    expect(await code(payouts.markPaid(admin, id, { paidOn: day(10) }))).toBe("validation_failed");
    expect(await code(payouts.markPaid(admin, id, { paidOn: "2026-02-30" }))).toBe(
      "validation_failed",
    );
    expect(await code(payouts.markPaid(admin, uuidv7(), { paidOn: day(3) }))).toBe("not_found");
    const done = await payouts.markPaid(admin, id, {
      paidOn: day(3),
      note: "bank transfer ref 123",
    });
    expect(done.status).toBe("paid");
    expect(await status("payouts", id)).toBe("paid");
    expect(await code(payouts.markPaid(admin, id, { paidOn: day(3) }))).toBe("conflict");
    expect(markPaidBody.safeParse({ paidOn: day(0), note: "" }).success).toBe(false);
    expect(markPaidBody.safeParse({ paidOn: day(0), amountPaise: 1 }).success).toBe(false);
  });
});
