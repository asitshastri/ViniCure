import type { PaymentRow } from "./repo";
import type { LedgerRepo } from "./ledger-repo";

// The earnings ledger (P5-06). When a payment is captured and its booking confirmed, two entries
// are written: the platform's fee and the doctor's share. Paise are whole numbers, so the fee is
// rounded down and the doctor gets the rest; the two always add up to what was paid.

export const MAX_FEE_BPS = 10_000;

export function splitPayment(
  amountPaise: number,
  feeBps: number,
): { platformFeePaise: number; doctorSharePaise: number } {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error("bad payment amount");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
    throw new Error("bad platform fee rate");
  }
  const platformFeePaise = Math.floor((amountPaise * feeBps) / MAX_FEE_BPS);
  return { platformFeePaise, doctorSharePaise: amountPaise - platformFeePaise };
}

type Deps = { repo: LedgerRepo; feeBps: () => number };

export class LedgerService {
  constructor(private readonly deps: Deps) {}

  /** Safe to run again for the same payment: the second run writes nothing. */
  async recordCapture(payment: Pick<PaymentRow, "id" | "amountPaise">): Promise<boolean> {
    const { platformFeePaise } = splitPayment(payment.amountPaise, this.deps.feeBps());
    return this.deps.repo.recordCapture(payment.id, platformFeePaise);
  }
}
