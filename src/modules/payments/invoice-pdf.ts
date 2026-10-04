import PDFDocument from "pdfkit";
import type { InvoiceData } from "./invoice-repo";

// Draws an invoice (P5-08). The words and fields here, above all the tax lines, are the
// accountant's to confirm (TODO.md): until then no tax is shown unless a rate has been set, and
// the seller's name, address and tax number appear only when they are configured.

export type Seller = { name?: string; address?: string; taxId?: string };

const IST_OFFSET_MS = 5.5 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date as shown to the patient, in India time. */
export function formatIstDate(date: Date): string {
  const t = new Date(date.getTime() + IST_OFFSET_MS);
  return `${String(t.getUTCDate()).padStart(2, "0")} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
function formatIstDateTime(date: Date): string {
  const t = new Date(date.getTime() + IST_OFFSET_MS);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${formatIstDate(date)}, ${hh}:${mm} IST`;
}

/** 49900 becomes "INR 499.00". Money stays whole paise everywhere; only this line formats it. */
export function formatInr(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const rest = String(Math.abs(paise % 100)).padStart(2, "0");
  return `INR ${rupees.toLocaleString("en-IN")}.${rest}`;
}

/** The financial year an instant falls in, in India time: April to March, for example "2026-27". */
export function financialYearOf(date: Date): string {
  const t = new Date(date.getTime() + IST_OFFSET_MS);
  const start = t.getUTCMonth() >= 3 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function renderInvoicePdf(
  data: InvoiceData,
  seller: Seller,
  options: { compress?: boolean } = {},
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      compress: options.compress ?? true,
      info: { Title: `Invoice ${data.invoiceNo}`, Author: seller.name ?? "ViniCure" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text("Invoice");
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Invoice number: ${data.invoiceNo}`);
    doc.text(`Date: ${formatIstDate(data.issuedAt)}`);
    doc.text(`Financial year: ${data.financialYear}`);
    doc.moveDown();

    doc.font("Helvetica-Bold").text("Issued by");
    doc.font("Helvetica").text(seller.name ?? "ViniCure");
    if (seller.address) doc.text(seller.address);
    if (seller.taxId) doc.text(`Tax number: ${seller.taxId}`);
    doc.moveDown();

    doc.font("Helvetica-Bold").text("Billed to");
    doc.font("Helvetica").text(data.patientName);
    doc.moveDown();

    doc.font("Helvetica-Bold").text("Service");
    doc.font("Helvetica");
    doc.text(`Online consultation with ${data.doctorName}`);
    doc.text(`${data.doctorQualifications}`);
    doc.text(`Registration number: ${data.doctorRegistrationNo} (${data.doctorCouncil})`);
    doc.text(`Appointment: ${formatIstDateTime(data.appointmentStart)}`);
    doc.moveDown();

    const net = data.totalPaise - data.taxPaise;
    doc.font("Helvetica-Bold").text("Amount");
    doc.font("Helvetica");
    if (data.taxPaise > 0) {
      doc.text(`Consultation fee: ${formatInr(net)}`);
      doc.text(
        `Tax at ${(data.taxRateBps / 100).toFixed(2)}% (included): ${formatInr(data.taxPaise)}`,
      );
    }
    doc.font("Helvetica-Bold").text(`Total paid: ${formatInr(data.totalPaise)}`);
    doc
      .font("Helvetica")
      .text(`Paid on: ${formatIstDate(data.paidAt)} (reference ${data.paymentRef})`);
    doc.end();
  });
}
