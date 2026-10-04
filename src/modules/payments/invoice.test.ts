import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakePaymentProvider } from "../../lib/adapters/fakes";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { uuidv7 } from "../../lib/ids";
import type { Principal } from "../identity/policy";
import { AppError } from "../../lib/errors/app-error";
import { StorageService, type ObjectStore } from "../../lib/storage/storage";
import { InvoiceService, includedTax, invoiceNumber } from "./invoice";
import { InvoiceRepo } from "./invoice-repo";
import { financialYearOf, formatInr, renderInvoicePdf } from "./invoice-pdf";
import { PaymentService } from "./service";
import { createPaymentServices } from "./wiring";
import { verifyBody } from "./schemas";

// Invoices (P5-08): numbering, the PDF, the stored file, the download link.
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
let invoices: InvoiceService;
let taxBps = 0;
let seller: { name?: string; address?: string; taxId?: string } = {};
const written = new Map<string, Uint8Array>();
let requeued: string[] = [];
const store: ObjectStore = {
  presignPut: async () => "x",
  presignGet: async (a) => `https://fake/${a.bucket}/${a.key}?ttl=${a.ttlSeconds}`,
  head: async () => null,
  readHead: async () => new Uint8Array(),
  read: async () => (async function* () {})(),
  put: async (a) => void written.set(`${a.bucket}/${a.key}`, a.body),
  delete: async (b, k) => void written.delete(`${b}/${k}`),
};
const storage = new StorageService(store, {
  buckets: { files: "vc-files", exports: "vc-exports" },
  region: "ap-south-1",
  signedUrlTtlSeconds: 300,
});

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
  taxBps = 0;
  seller = {};
  written.clear();
  requeued = [];
  invoices = new InvoiceService({
    repo: new InvoiceRepo(q, tx),
    payments: parts.repo,
    storage: () => storage,
    taxBps: () => taxBps,
    seller: () => seller,
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
     VALUES ($1,'Dr Invoice',$2,'Council','MBBS',$3)`,
    [doctorId, `IV-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
  );
});

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
/** The words drawn on the page: pdfkit writes them as hex pieces inside TJ operators, one per line. */
const words = (bytes: Uint8Array) =>
  [...text(bytes).matchAll(/\[([^\]]*)\]\s*TJ/g)]
    .map((m) =>
      [...(m[1] ?? "").matchAll(/<([0-9a-f]*)>/g)]
        .map((h) => Buffer.from(h[1] ?? "", "hex").toString("latin1"))
        .join(""),
    )
    .join("\n");
const invoiceRow = async (paymentId: string) =>
  (
    await q.query(
      "SELECT id, invoice_no, financial_year, tax_paise, total_paise, tax_rate_bps, pdf_file_id FROM invoices WHERE payment_id=$1",
      [paymentId],
    )
  ).rows[0];
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};

describe("financial year and numbers", () => {
  it("the year runs April to March in India time, to the second", () => {
    const at = (iso: string) => financialYearOf(new Date(iso));
    expect(at("2027-03-31T18:29:59Z")).toBe("2026-27"); // 23:59:59 IST on 31 March
    expect(at("2027-03-31T18:30:00Z")).toBe("2027-28"); // midnight IST, 1 April
    expect(at("2026-04-01T00:00:00+05:30")).toBe("2026-27");
    expect(at("2026-03-31T23:59:59+05:30")).toBe("2025-26");
    expect(at("2026-10-04T12:00:00Z")).toBe("2026-27");
    expect(at("2027-01-15T12:00:00Z")).toBe("2026-27");
    expect(at("2099-12-31T12:00:00Z")).toBe("2099-00");
  });
  it("numbers are padded and carry the year", () => {
    expect(invoiceNumber("2026-27", 1)).toBe("VC/2026-27/000001");
    expect(invoiceNumber("2026-27", 123456)).toBe("VC/2026-27/123456");
  });
  it("tax included in a price is worked out from the price, never added on top", () => {
    expect(includedTax(49900, 0)).toBe(0);
    expect(includedTax(118000, 1800)).toBe(18000);
    expect(includedTax(49900, 1800)).toBe(49900 - Math.round((49900 * 10000) / 11800));
    for (const amount of [1, 99, 49900, 123457]) {
      for (const bps of [0, 500, 1800, 10000]) {
        const tax = includedTax(amount, bps);
        expect(tax).toBeGreaterThanOrEqual(0);
        expect(tax).toBeLessThanOrEqual(amount);
      }
    }
  });
  it("money is shown from whole paise", () => {
    expect(formatInr(49900)).toBe("INR 499.00");
    expect(formatInr(5)).toBe("INR 0.05");
    expect(formatInr(123456789)).toBe("INR 12,34,567.89");
  });
});

describe("issuing", () => {
  it("a booked and paid consultation gets one numbered invoice with its PDF stored privately", async () => {
    const b = await booking();
    expect(await invoices.issueAndRender(b.order.paymentId)).toBe("issued");
    const inv = await invoiceRow(b.order.paymentId);
    expect(String(inv?.invoice_no)).toMatch(/^VC\/\d{4}-\d{2}\/\d{6}$/);
    expect(inv).toMatchObject({ total_paise: 49900, tax_paise: 0, tax_rate_bps: 0 });
    expect(inv?.pdf_file_id).not.toBeNull();
    const file = (
      await q.query(
        "SELECT owner_user_id, purpose, storage_key, mime_type, scan_status, size_bytes FROM files WHERE id=$1",
        [inv?.pdf_file_id],
      )
    ).rows[0];
    expect(file).toMatchObject({
      owner_user_id: asha.userId,
      purpose: "invoice_pdf",
      mime_type: "application/pdf",
      scan_status: "clean",
    });
    expect(String(file?.storage_key)).toMatch(/^invoice_pdf\/\d{4}\/[0-9a-f-]{36}\.pdf$/);
    expect(text([...written.values()][0] as Uint8Array).startsWith("%PDF-")).toBe(true);
    expect(written.size).toBe(1);
  });

  it("running it again changes nothing: same invoice, one file", async () => {
    const b = await booking();
    await invoices.issueAndRender(b.order.paymentId);
    const first = await invoiceRow(b.order.paymentId);
    expect(await invoices.issueAndRender(b.order.paymentId)).toBe("already");
    expect(await invoiceRow(b.order.paymentId)).toEqual(first);
    expect(written.size).toBe(1);
  });

  it("numbers run one after another with no gaps", async () => {
    const numbers: number[] = [];
    for (let i = 0; i < 4; i++) {
      const b = await booking();
      await invoices.issueAndRender(b.order.paymentId);
      numbers.push(Number(String((await invoiceRow(b.order.paymentId))?.invoice_no).split("/")[2]));
    }
    expect(numbers.slice(1).map((v, i) => v - (numbers[i] as number))).toEqual([1, 1, 1]);
  });

  it("a failure while drawing or storing leaves no gap, and the retry finishes the job", async () => {
    const b = await booking();
    const failing = new InvoiceService({
      repo: new InvoiceRepo(q, tx),
      payments: parts.repo,
      storage: () => {
        throw new Error("storage down");
      },
      taxBps: () => 0,
      seller: () => ({}),
    });
    await expect(failing.issueAndRender(b.order.paymentId)).rejects.toThrow("storage down");
    // The invoice was issued (its number is taken) but has no PDF yet.
    const half = await invoiceRow(b.order.paymentId);
    expect(half?.pdf_file_id).toBeNull();
    expect(await invoices.issueAndRender(b.order.paymentId)).toBe("issued");
    const done = await invoiceRow(b.order.paymentId);
    expect(done?.invoice_no).toBe(half?.invoice_no);
    expect(done?.pdf_file_id).not.toBeNull();
  });

  it("no invoice for money not taken, a lost time that was refunded, or a booking the doctor cancelled", async () => {
    const unpaid = await booking({ pay: false });
    expect(await invoices.issueAndRender(unpaid.order.paymentId)).toBe("not_billable");

    const lost = await booking({ pay: false });
    await q.query(
      "UPDATE appointments SET status='cancelled_by_admin', hold_expires_at=NULL WHERE id=$1",
      [lost.appt],
    );
    gateway.capture(lost.gatewayPaymentId, lost.order.orderId);
    await service.verify(
      asha,
      verifyBody.parse({
        paymentId: lost.order.paymentId,
        gatewayPaymentId: lost.gatewayPaymentId,
        signature: gateway.signCheckout(lost.order.orderId, lost.gatewayPaymentId),
      }),
    );
    expect(await invoices.issueAndRender(lost.order.paymentId)).toBe("not_billable");

    const cancelled = await booking();
    await q.query("UPDATE appointments SET status='cancelled_by_doctor' WHERE id=$1", [
      cancelled.appt,
    ]);
    expect(await invoices.issueAndRender(cancelled.order.paymentId)).toBe("not_billable");
    expect(written.size).toBe(0);
    expect(await invoiceRow(unpaid.order.paymentId)).toBeUndefined();
  });

  it("the rate in force when the invoice was issued is kept on it", async () => {
    taxBps = 1800;
    const b = await booking();
    await invoices.issueAndRender(b.order.paymentId);
    expect(await invoiceRow(b.order.paymentId)).toMatchObject({
      tax_rate_bps: 1800,
      tax_paise: includedTax(49900, 1800),
    });
  });

  it("an issued invoice cannot be changed or removed", async () => {
    const b = await booking();
    await invoices.issueAndRender(b.order.paymentId);
    for (const sql of [
      "UPDATE invoices SET total_paise = 1 WHERE payment_id = $1",
      "UPDATE invoices SET invoice_no = 'VC/0000-00/000000' WHERE payment_id = $1",
      "UPDATE invoices SET pdf_file_id = NULL WHERE payment_id = $1",
      "DELETE FROM invoices WHERE payment_id = $1",
    ]) {
      await expect(q.query(sql, [b.order.paymentId]), sql).rejects.toThrow();
    }
  });
});

describe("the PDF", () => {
  const data = {
    invoiceNo: "VC/2026-27/000042",
    issuedAt: new Date("2026-10-04T10:00:00Z"),
    financialYear: "2026-27",
    totalPaise: 49900,
    taxPaise: 0,
    taxRateBps: 0,
    paymentRef: "AB12CD34",
    paidAt: new Date("2026-10-04T09:55:00Z"),
    appointmentStart: new Date("2026-10-06T04:30:00Z"),
    patientName: "Asha Verma",
    doctorName: "Dr Invoice",
    doctorRegistrationNo: "MH-12345",
    doctorCouncil: "Maharashtra Medical Council",
    doctorQualifications: "MBBS, MD",
  };
  const raw = async (over = {}, who = {}) =>
    renderInvoicePdf({ ...data, ...over }, who, { compress: false });
  const draw = async (over = {}, who = {}) => words(await raw(over, who));

  it("shows the number, the doctor with the registration number, the patient, the time and the total", async () => {
    expect(text(await raw()).startsWith("%PDF-")).toBe(true);
    const pdf = await draw();
    for (const expected of [
      "VC/2026-27/000042",
      "Dr Invoice",
      "Registration number: MH-12345",
      "Maharashtra Medical Council",
      "Asha Verma",
      "06 Oct 2026, 10:00 IST",
      "INR 499.00",
      "AB12CD34",
    ]) {
      expect(pdf, expected).toContain(expected);
    }
  });

  it("shows no tax line unless there is tax, and the seller only when it is set", async () => {
    expect(await draw()).not.toContain("Tax at");
    expect(await draw()).not.toContain("Tax number");
    const taxed = await draw(
      { taxPaise: 7612, taxRateBps: 1800 },
      { name: "Example Health Pvt Ltd", taxId: "TAX123" },
    );
    expect(taxed).toContain("Tax at 18.00%");
    expect(taxed).toContain("Example Health Pvt Ltd");
    expect(taxed).toContain("Tax number: TAX123");
  });

  it("odd characters in names cannot break the file", async () => {
    const bytes = await raw({
      patientName: "A (B) \\ ) ( \u0905\u0936\u094b\u0915",
      doctorName: "Dr <script>",
    });
    const pdf = text(bytes);
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    // The parentheses and the backslash are drawn as text, not read as PDF syntax.
    expect(words(bytes)).toContain("A (B) \\ ) (");
  });
});

describe("the download link", () => {
  it("is 'preparing' until the PDF exists, then a short-lived link for the payer only", async () => {
    const b = await booking();
    expect(await invoices.linkFor(asha, b.order.paymentId)).toEqual({ status: "preparing" });
    await invoices.issueAndRender(b.order.paymentId);
    const link = await invoices.linkFor(asha, b.order.paymentId);
    expect(link.status).toBe("ready");
    if (link.status === "ready") {
      expect(link.url).toMatch(/^https:\/\/fake\/vc-files\/invoice_pdf\//);
      expect(link.url).toContain("ttl=300");
      expect(link.invoiceNo).toMatch(/^VC\//);
    }
  });

  it("anyone else gets the same answer as for a payment that does not exist", async () => {
    const b = await booking();
    await invoices.issueAndRender(b.order.paymentId);
    const stranger = await person();
    expect(await code(invoices.linkFor(stranger, b.order.paymentId))).toMatch(
      /^(not_found|forbidden)$/,
    );
    expect(
      await code(invoices.linkFor({ userId: uuidv7(), roles: ["doctor"] }, b.order.paymentId)),
    ).toMatch(/^(not_found|forbidden)$/);
    expect(await code(invoices.linkFor(asha, uuidv7()))).toBe("not_found");
  });
});

describe("a paid booking with no invoice", () => {
  it("is found by the daily check and queued again", async () => {
    const b = await booking();
    await q.query("UPDATE payments SET captured_at = now() - interval '1 hour' WHERE id=$1", [
      b.order.paymentId,
    ]);
    const rec = createPaymentServices({
      feeBps: () => 0,
      db: q,
      tx,
      gateway: () => gateway,
      enqueue: async () => undefined,
      enqueueInvoice: async (id) => void requeued.push(id),
    });
    const report = await rec.reconcile.run();
    expect(report.invoicesRequeued).toBeGreaterThanOrEqual(1);
    expect(requeued).toContain(b.order.paymentId);
    await invoices.issueAndRender(b.order.paymentId);
    requeued = [];
    await rec.reconcile.run();
    expect(requeued).not.toContain(b.order.paymentId);
  });

  it("confirming a payment asks for the invoice once the booking is confirmed", async () => {
    const asked: string[] = [];
    const wired = createPaymentServices({
      feeBps: () => 0,
      db: q,
      tx,
      gateway: () => gateway,
      enqueue: async () => undefined,
      enqueueInvoice: async (id) => void asked.push(id),
    });
    const svc = new PaymentService({
      repo: wired.repo,
      gateway: () => gateway,
      publicKeyId: () => "rzp_test",
      settlement: wired.settlement,
    });
    const appt = uuidv7();
    const start = new Date(Date.UTC(2034, 0, 1) + ++n * 3_600_000);
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'held',49900, now() + interval '10 minutes')`,
      [appt, patientId, doctorId, asha.userId, start, new Date(start.getTime() + 1_800_000)],
    );
    const order = await svc.createOrder(asha, { appointmentId: appt }, `inv-key-${++n}-padding`);
    const gw = `pay_${String(++n).padStart(8, "0")}`;
    gateway.capture(gw, order.orderId);
    await svc.verify(
      asha,
      verifyBody.parse({
        paymentId: order.paymentId,
        gatewayPaymentId: gw,
        signature: gateway.signCheckout(order.orderId, gw),
      }),
    );
    expect(asked).toEqual([order.paymentId]);
  });
});
