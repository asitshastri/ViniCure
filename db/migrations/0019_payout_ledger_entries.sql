-- Payouts (P5-09). A payout takes money out of a doctor's balance, so it is an entry in the
-- earnings ledger. 0017 required every ledger entry to belong to a payment, which a payout does
-- not. A payout entry now names its payout instead (and no payment); every other entry still
-- names its payment and no payout.

ALTER TABLE earnings_ledger ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE earnings_ledger ADD COLUMN payout_id uuid REFERENCES payouts (id);
ALTER TABLE earnings_ledger ADD CONSTRAINT ledger_payout_check CHECK (
  CASE
    WHEN entry_type = 'payout' THEN payout_id IS NOT NULL AND payment_id IS NULL AND refund_id IS NULL
    ELSE payout_id IS NULL AND payment_id IS NOT NULL
  END);
-- A payout is claimed from the balance once.
CREATE UNIQUE INDEX ledger_payout_once_idx ON earnings_ledger (payout_id) WHERE payout_id IS NOT NULL;
