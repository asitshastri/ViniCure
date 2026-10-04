import type { Queryable, TxRunner } from "../../lib/db/queryable";

// Invoice queries (P5-08). Only this file and repo.ts talk to the database for payments.

export type InvoiceRow = {
  id: string;
  paymentId: string;
  invoiceNo: string;
  financialYear: string;
  taxPaise: number;
  totalPaise: number;
  taxRateBps: number;
  issuedAt: Date;
  pdfFileId: string | null;
};

/** What the PDF shows. Everything here is read from our own records at render time. */
export type InvoiceData = {
  invoiceNo: string;
  issuedAt: Date;
  financialYear: string;
  totalPaise: number;
  taxPaise: number;
  taxRateBps: number;
  paymentRef: string;
  paidAt: Date;
  appointmentStart: Date;
  patientName: string;
  doctorName: string;
  doctorRegistrationNo: string;
  doctorCouncil: string;
  doctorQualifications: string;
};

const INVOICE_COLUMNS =
  "i.id, i.payment_id, i.invoice_no, i.financial_year, i.tax_paise, i.total_paise, i.tax_rate_bps, i.issued_at, i.pdf_file_id";

const RETURNING_COLUMNS =
  "id, payment_id, invoice_no, financial_year, tax_paise, total_paise, tax_rate_bps, issued_at, pdf_file_id";

function toInvoice(r: Record<string, unknown>): InvoiceRow {
  return {
    id: String(r.id),
    paymentId: String(r.payment_id),
    invoiceNo: String(r.invoice_no),
    financialYear: String(r.financial_year),
    taxPaise: Number(r.tax_paise),
    totalPaise: Number(r.total_paise),
    taxRateBps: Number(r.tax_rate_bps),
    issuedAt: new Date(String(r.issued_at)),
    pdfFileId: r.pdf_file_id === null ? null : String(r.pdf_file_id),
  };
}

/** Appointment states in which a consultation was booked and not undone. */
const BILLABLE = "('scheduled', 'in_progress', 'completed', 'no_show')";

export class InvoiceRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  async findByPayment(paymentId: string): Promise<InvoiceRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${INVOICE_COLUMNS} FROM invoices i WHERE i.payment_id = $1`,
      [paymentId],
    );
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  /**
   * Issues the invoice for a payment, once. The payment row is locked, so two workers cannot
   * issue two; the yearly counter is raised in the same transaction, so a failure leaves no gap in
   * the numbers. Returns null when the payment is not one that gets an invoice (money not taken, or
   * the booking was cancelled or never happened).
   */
  async issue(input: {
    id: string;
    paymentId: string;
    financialYearOf: (capturedAt: Date) => string;
    taxFor: (amountPaise: number) => { taxPaise: number; taxRateBps: number };
    format: (financialYear: string, n: number) => string;
  }): Promise<InvoiceRow | null> {
    return this.tx.transaction(async (q) => {
      const locked = await q.query(
        `SELECT p.amount_paise, p.captured_at FROM payments p
           JOIN appointments a ON a.id = p.appointment_id
          WHERE p.id = $1 AND p.status IN ('captured', 'partially_refunded') AND a.status IN ${BILLABLE}
          FOR UPDATE OF p`,
        [input.paymentId],
      );
      const pay = locked.rows[0];
      if (!pay) return null;
      const existing = await q.query(
        `SELECT ${INVOICE_COLUMNS} FROM invoices i WHERE i.payment_id = $1`,
        [input.paymentId],
      );
      if (existing.rows[0]) return toInvoice(existing.rows[0]);

      const year = input.financialYearOf(new Date(String(pay.captured_at)));
      const counter = await q.query(
        `INSERT INTO invoice_counters (financial_year, last_number) VALUES ($1, 1)
         ON CONFLICT (financial_year) DO UPDATE SET last_number = invoice_counters.last_number + 1
         RETURNING last_number`,
        [year],
      );
      const number = Number(counter.rows[0]?.last_number);
      const total = Number(pay.amount_paise);
      const { taxPaise, taxRateBps } = input.taxFor(total);
      const { rows } = await q.query(
        `INSERT INTO invoices (id, payment_id, invoice_no, financial_year, tax_paise, total_paise, tax_rate_bps)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${RETURNING_COLUMNS}`,
        [input.id, input.paymentId, input.format(year, number), year, taxPaise, total, taxRateBps],
      );
      return toInvoice(rows[0] as Record<string, unknown>);
    });
  }

  /** The facts printed on the invoice. */
  async dataFor(invoiceId: string): Promise<InvoiceData | null> {
    const { rows } = await this.db.query(
      `SELECT i.invoice_no, i.issued_at, i.financial_year, i.total_paise, i.tax_paise, i.tax_rate_bps,
              p.id AS payment_id, p.captured_at, a.start_at, pt.full_name AS patient_name,
              d.display_name, d.registration_no, d.registration_council, d.qualifications
         FROM invoices i
         JOIN payments p ON p.id = i.payment_id
         JOIN appointments a ON a.id = p.appointment_id
         JOIN patients pt ON pt.id = a.patient_id
         JOIN doctors d ON d.id = a.doctor_id
        WHERE i.id = $1`,
      [invoiceId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      invoiceNo: String(r.invoice_no),
      issuedAt: new Date(String(r.issued_at)),
      financialYear: String(r.financial_year),
      totalPaise: Number(r.total_paise),
      taxPaise: Number(r.tax_paise),
      taxRateBps: Number(r.tax_rate_bps),
      paymentRef: String(r.payment_id).slice(-8).toUpperCase(),
      paidAt: new Date(String(r.captured_at)),
      appointmentStart: new Date(String(r.start_at)),
      patientName: String(r.patient_name),
      doctorName: String(r.display_name),
      doctorRegistrationNo: String(r.registration_no),
      doctorCouncil: String(r.registration_council),
      doctorQualifications: String(r.qualifications),
    };
  }

  /**
   * Records the stored PDF as a file owned by the payer and links it to the invoice, once. The
   * server made the file, so it needs no virus scan and is marked clean.
   */
  async attachPdf(input: {
    invoiceId: string;
    fileId: string;
    storageKey: string;
    originalName: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<boolean> {
    return this.tx.transaction(async (q) => {
      const owner = await q.query(
        `SELECT p.payer_user_id, a.patient_id, i.pdf_file_id
           FROM invoices i JOIN payments p ON p.id = i.payment_id
           JOIN appointments a ON a.id = p.appointment_id
          WHERE i.id = $1 FOR UPDATE OF i`,
        [input.invoiceId],
      );
      const row = owner.rows[0];
      if (!row || row.pdf_file_id !== null) return false;
      await q.query(
        `INSERT INTO files (id, owner_user_id, patient_id, purpose, storage_key, original_name, mime_type,
                            size_bytes, sha256, scan_status, scanned_at, uploaded_at)
         VALUES ($1, $2, $3, 'invoice_pdf', $4, $5, 'application/pdf', $6, $7, 'clean', now(), now())`,
        [
          input.fileId,
          String(row.payer_user_id),
          String(row.patient_id),
          input.storageKey,
          input.originalName,
          input.sizeBytes,
          input.sha256,
        ],
      );
      await q.query("UPDATE invoices SET pdf_file_id = $2 WHERE id = $1", [
        input.invoiceId,
        input.fileId,
      ]);
      return true;
    });
  }

  /** Where a ready invoice's PDF is stored. */
  async pdfKeyFor(paymentId: string): Promise<{ storageKey: string; invoiceNo: string } | null> {
    const { rows } = await this.db.query(
      `SELECT f.storage_key, i.invoice_no FROM invoices i JOIN files f ON f.id = i.pdf_file_id
        WHERE i.payment_id = $1 AND f.deleted_at IS NULL`,
      [paymentId],
    );
    return rows[0]
      ? { storageKey: String(rows[0].storage_key), invoiceNo: String(rows[0].invoice_no) }
      : null;
  }

  /** Booked and paid more than a few minutes ago, but with no invoice (a lost job). */
  async missingInvoices(limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT p.id FROM payments p JOIN appointments a ON a.id = p.appointment_id
        WHERE p.status IN ('captured', 'partially_refunded') AND a.status IN ${BILLABLE}
          AND p.captured_at < now() - interval '10 minutes'
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.payment_id = p.id AND i.pdf_file_id IS NOT NULL)
        ORDER BY p.captured_at LIMIT $1`,
      [limit],
    );
    return rows.map((r) => String(r.id));
  }
}
