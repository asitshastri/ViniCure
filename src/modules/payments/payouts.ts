import { z } from "zod";
import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { logger } from "../../lib/logging/logger";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { PayoutRepo, PayoutRow } from "./payout-repo";

// Paying doctors (P5-09): money moves outside the system (a bank transfer made by hand), so the
// system claims each doctor's balance, hands over a CSV to pay from, and records when it was paid.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the form 2026-09-30.");
export const payoutPeriodBody = z.object({ periodStart: date, periodEnd: date }).strict();
export const payoutPeriodQuery = payoutPeriodBody;
export const markPaidBody = z
  .object({ paidOn: date, note: z.string().trim().min(1).max(300).optional() })
  .strict();
export const payoutIdParams = z.object({ id: z.uuid() }).strict();
export type PayoutPeriod = z.infer<typeof payoutPeriodBody>;
export type MarkPaidBody = z.infer<typeof markPaidBody>;

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 366;

/** Today's date in India, as 2026-10-04. */
export function istToday(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function validDate(value: string): boolean {
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

/**
 * A spreadsheet runs a cell that begins with = + - @ (or a tab or return) as a formula, so such
 * a cell is made plain text. A cell with a comma, quote or line break is quoted.
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const rupees = (paise: number): string =>
  `${Math.trunc(paise / 100)}.${String(Math.abs(paise % 100)).padStart(2, "0")}`;

export function payoutsCsv(rows: PayoutRow[]): string {
  const header = [
    "payout_id",
    "doctor_id",
    "doctor_name",
    "registration_no",
    "period_start",
    "period_end",
    "amount_inr",
    "amount_paise",
    "status",
  ];
  const lines = rows.map((r) =>
    [
      r.id,
      r.doctorId,
      r.doctorName,
      r.registrationNo,
      r.periodStart,
      r.periodEnd,
      rupees(r.amountPaise),
      r.amountPaise,
      r.status,
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

type Deps = { repo: PayoutRepo; now?: () => number };

export type PayoutView = {
  payoutId: string;
  doctorId: string;
  amountPaise: number;
  status: string;
};

export class PayoutService {
  constructor(private readonly deps: Deps) {}

  private now = () => (this.deps.now ?? Date.now)();

  private checkPeriod(period: PayoutPeriod): void {
    const problems: { path: string; message: string }[] = [];
    if (!validDate(period.periodStart))
      problems.push({ path: "periodStart", message: "Not a real date." });
    if (!validDate(period.periodEnd))
      problems.push({ path: "periodEnd", message: "Not a real date." });
    if (problems.length === 0) {
      const days = (Date.parse(period.periodEnd) - Date.parse(period.periodStart)) / DAY_MS;
      if (days < 0)
        problems.push({ path: "periodEnd", message: "The end cannot be before the start." });
      else if (days >= MAX_SPAN_DAYS)
        problems.push({ path: "periodEnd", message: "A period is at most one year." });
      // Only whole days that are over: today's shares are still arriving.
      if (period.periodEnd >= istToday(this.now()))
        problems.push({ path: "periodEnd", message: "The last day must be before today." });
    }
    if (problems.length > 0) throw errors.validation(problems);
  }

  /** Claims each doctor's balance up to the end of the period. Doctors owed nothing get no payout. */
  async create(
    principal: Principal,
    period: PayoutPeriod,
  ): Promise<{ created: PayoutView[]; totalPaise: number }> {
    assertAllowed(can.payout.create(principal, { ownerUserId: "" }));
    this.checkPeriod(period);
    const cutoff = new Date(Date.parse(`${period.periodEnd}T00:00:00+05:30`) + DAY_MS);
    const made = await this.deps.repo.createForPeriod({ ...period, cutoff, newId: uuidv7 });
    const totalPaise = made.reduce((sum, p) => sum + p.amountPaise, 0);
    logger.info({ event: "payouts_created", count: made.length, totalPaise });
    return {
      created: made.map((p) => ({
        payoutId: p.id,
        doctorId: p.doctorId,
        amountPaise: p.amountPaise,
        status: p.status,
      })),
      totalPaise,
    };
  }

  /** The file the admin pays from. Names and registration numbers only: no bank or contact details. */
  async exportCsv(principal: Principal, period: PayoutPeriod): Promise<string> {
    assertAllowed(can.payout.read(principal, { ownerUserId: "" }));
    this.checkPeriod(period);
    return payoutsCsv(await this.deps.repo.listForPeriod(period.periodStart, period.periodEnd));
  }

  async markPaid(principal: Principal, id: string, input: MarkPaidBody): Promise<PayoutView> {
    assertAllowed(can.payout.settle(principal, { ownerUserId: "" }));
    if (!validDate(input.paidOn) || input.paidOn > istToday(this.now())) {
      throw errors.validation([
        { path: "paidOn", message: "Use a real date that is not in the future." },
      ]);
    }
    const existing = await this.deps.repo.findById(id);
    if (!existing) throw errors.notFound();
    const done = await this.deps.repo.markPaid(id, input.paidOn, input.note ?? null);
    if (!done) throw errors.conflict({ detail: "This payout is already marked as paid." });
    return {
      payoutId: done.id,
      doctorId: done.doctorId,
      amountPaise: done.amountPaise,
      status: done.status,
    };
  }
}
