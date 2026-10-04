import type { Queryable, TxRunner } from "../../lib/db/queryable";

// Payout queries (P5-09). Only this file and the other repo files talk to the database for
// payments. A payout is a claim on a doctor's balance: the payout row and its ledger entry are
// written together, so the money can never be claimed twice.

export type PayoutRow = {
  id: string;
  doctorId: string;
  doctorName: string;
  registrationNo: string;
  amountPaise: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidOn: string | null;
  note: string | null;
};

const PAYOUT_COLUMNS =
  "po.id, po.doctor_id, d.display_name, d.registration_no, po.amount_paise, po.status," +
  " po.period_start::text AS period_start, po.period_end::text AS period_end," +
  " po.paid_on::text AS paid_on, po.note";

function toPayout(r: Record<string, unknown>): PayoutRow {
  return {
    id: String(r.id),
    doctorId: String(r.doctor_id),
    doctorName: String(r.display_name),
    registrationNo: String(r.registration_no),
    amountPaise: Number(r.amount_paise),
    status: String(r.status),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    paidOn: r.paid_on === null ? null : String(r.paid_on),
    note: r.note === null ? null : String(r.note),
  };
}

/** One number for every payout run, so two runs never claim the same balance at once. */
const PAYOUT_LOCK = 7_305_001;

export class PayoutRepo {
  constructor(
    private readonly db: Queryable,
    private readonly tx: TxRunner,
  ) {}

  /**
   * Claims what each doctor is owed as of `cutoff` (their shares and reversals up to then, less
   * everything already claimed by earlier payouts). Doctors owed nothing are skipped. Asking
   * again for the same period creates nothing new. Returns the payouts made by this call.
   */
  async createForPeriod(input: {
    periodStart: string;
    periodEnd: string;
    cutoff: Date;
    newId: () => string;
  }): Promise<PayoutRow[]> {
    return this.tx.transaction(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock($1)", [PAYOUT_LOCK]);
      const owed = await q.query(
        `SELECT doctor_id,
                COALESCE(sum(amount_paise) FILTER (
                  WHERE entry_type IN ('doctor_share', 'doctor_share_reversal') AND created_at < $1), 0)
                + COALESCE(sum(amount_paise) FILTER (WHERE entry_type = 'payout'), 0) AS owed
           FROM earnings_ledger GROUP BY doctor_id ORDER BY doctor_id`,
        [input.cutoff],
      );
      const made: string[] = [];
      for (const row of owed.rows) {
        const amount = Number(row.owed);
        if (amount <= 0) continue;
        const id = input.newId();
        const inserted = await q.query(
          `INSERT INTO payouts (id, doctor_id, amount_paise, period_start, period_end)
           VALUES ($1, $2, $3, $4::date, $5::date)
           ON CONFLICT (doctor_id, period_start, period_end) DO NOTHING RETURNING id`,
          [id, String(row.doctor_id), amount, input.periodStart, input.periodEnd],
        );
        if (inserted.rows.length === 0) continue;
        await q.query(
          `INSERT INTO earnings_ledger (doctor_id, payout_id, entry_type, amount_paise)
           VALUES ($1, $2, 'payout', $3)`,
          [String(row.doctor_id), id, -amount],
        );
        made.push(id);
      }
      if (made.length === 0) return [];
      const { rows } = await q.query(
        `SELECT ${PAYOUT_COLUMNS} FROM payouts po JOIN doctors d ON d.id = po.doctor_id
          WHERE po.id = ANY($1::uuid[]) ORDER BY d.display_name, po.id`,
        [made],
      );
      return rows.map(toPayout);
    });
  }

  /** Payouts of a period, for the settlement file. */
  async listForPeriod(periodStart: string, periodEnd: string): Promise<PayoutRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${PAYOUT_COLUMNS} FROM payouts po JOIN doctors d ON d.id = po.doctor_id
        WHERE po.period_start = $1::date AND po.period_end = $2::date
        ORDER BY d.display_name, po.id`,
      [periodStart, periodEnd],
    );
    return rows.map(toPayout);
  }

  async findById(id: string): Promise<PayoutRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${PAYOUT_COLUMNS} FROM payouts po JOIN doctors d ON d.id = po.doctor_id WHERE po.id = $1`,
      [id],
    );
    return rows[0] ? toPayout(rows[0]) : null;
  }

  /** Records that the money was sent. Only a payout still waiting can be marked. */
  async markPaid(id: string, paidOn: string, note: string | null): Promise<PayoutRow | null> {
    const { rows } = await this.db.query(
      `UPDATE payouts SET status = 'paid', paid_on = $2::date, note = $3
        WHERE id = $1 AND status IN ('processing', 'on_hold') RETURNING id`,
      [id, paidOn, note],
    );
    return rows[0] ? this.findById(id) : null;
  }
}
