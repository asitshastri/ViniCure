-- Payments (P5-01, docs/er_model.md part 4 and backend-architecture.md section 10).
-- Money is integer paise. The amount of a payment is copied from the appointment fee by the
-- server; nothing here accepts an amount from a client. The ledger and the event log are
-- append-only: the app role can add rows and read them, and a trigger stops changes even from
-- the table owner.

CREATE TABLE payments (
  id                      uuid PRIMARY KEY,
  appointment_id          uuid        NOT NULL REFERENCES appointments (id),
  payer_user_id           uuid        NOT NULL REFERENCES users (id),
  amount_paise            integer     NOT NULL,
  amount_refunded_paise   integer     NOT NULL DEFAULT 0,
  currency                text        NOT NULL DEFAULT 'INR',
  status                  text        NOT NULL DEFAULT 'created',
  gateway_order_id        text        NOT NULL,
  gateway_payment_id      text,
  idempotency_key         text        NOT NULL,
  failure_code            text,
  captured_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_check CHECK (amount_paise > 0),
  CONSTRAINT payments_currency_check CHECK (currency = 'INR'),
  CONSTRAINT payments_status_check CHECK (status IN
    ('created', 'captured', 'failed', 'partially_refunded', 'refunded')),
  CONSTRAINT payments_refund_range_check CHECK (
    amount_refunded_paise >= 0 AND amount_refunded_paise <= amount_paise),
  -- The status says how much has been given back.
  CONSTRAINT payments_refund_status_check CHECK (
    CASE status
      WHEN 'partially_refunded' THEN amount_refunded_paise > 0 AND amount_refunded_paise < amount_paise
      WHEN 'refunded' THEN amount_refunded_paise = amount_paise
      ELSE amount_refunded_paise = 0
    END),
  -- Money has been taken exactly when the payment says so.
  CONSTRAINT payments_captured_check CHECK (
    (status IN ('captured', 'partially_refunded', 'refunded')) = (captured_at IS NOT NULL)),
  CONSTRAINT payments_failure_check CHECK (failure_code IS NULL OR status = 'failed'),
  CONSTRAINT payments_key_length_check CHECK (char_length(idempotency_key) BETWEEN 16 AND 128)
);
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE UNIQUE INDEX payments_order_idx ON payments (gateway_order_id);
CREATE UNIQUE INDEX payments_gateway_payment_idx ON payments (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
-- A repeated request cannot create a second payment.
CREATE UNIQUE INDEX payments_idempotency_idx ON payments (idempotency_key);
-- One appointment is paid for once: attempts that failed or are still open do not count.
CREATE UNIQUE INDEX payments_one_paid_idx ON payments (appointment_id)
  WHERE status IN ('captured', 'partially_refunded');
CREATE INDEX payments_appointment_idx ON payments (appointment_id, created_at DESC);
CREATE INDEX payments_payer_idx ON payments (payer_user_id, created_at DESC);
-- Reconciliation looks at what is still open.
CREATE INDEX payments_open_idx ON payments (created_at) WHERE status = 'created';

-- What the gateway told us, stored once per event id. Only the fields we need are kept (ids,
-- amounts, status, method type), never the payer's contact details or account numbers.
CREATE TABLE payment_events (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id        uuid        REFERENCES payments (id),
  gateway_event_id  text        NOT NULL,
  event_type        text        NOT NULL,
  payload           jsonb       NOT NULL,
  signature_ok      boolean     NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  CONSTRAINT payment_events_type_length_check CHECK (char_length(event_type) BETWEEN 3 AND 80)
);
CREATE UNIQUE INDEX payment_events_event_idx ON payment_events (gateway_event_id);
CREATE INDEX payment_events_payment_idx ON payment_events (payment_id, id);
-- The worker's queue: stored, signature good, not handled yet.
CREATE INDEX payment_events_unprocessed_idx ON payment_events (id) WHERE processed_at IS NULL AND signature_ok;

-- Only processed_at may change on an event, and only from empty to a time.
CREATE FUNCTION payment_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_events is append-only';
  END IF;
  IF (NEW.id, NEW.payment_id, NEW.gateway_event_id, NEW.event_type, NEW.payload, NEW.signature_ok, NEW.received_at)
       IS DISTINCT FROM
     (OLD.id, OLD.payment_id, OLD.gateway_event_id, OLD.event_type, OLD.payload, OLD.signature_ok, OLD.received_at)
     OR OLD.processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'payment_events is append-only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_events_guard BEFORE UPDATE OR DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION payment_events_guard();
CREATE TRIGGER payment_events_no_truncate BEFORE TRUNCATE ON payment_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
REVOKE UPDATE, DELETE, TRUNCATE ON payment_events FROM app;
GRANT UPDATE (processed_at) ON payment_events TO app;

CREATE TABLE refunds (
  id                 uuid PRIMARY KEY,
  payment_id         uuid        NOT NULL REFERENCES payments (id),
  amount_paise       integer     NOT NULL,
  reason             text        NOT NULL,
  status             text        NOT NULL DEFAULT 'initiated',
  gateway_refund_id  text,
  initiated_by       uuid        REFERENCES users (id),
  idempotency_key    text        NOT NULL,
  processed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_amount_check CHECK (amount_paise > 0),
  CONSTRAINT refunds_status_check CHECK (status IN ('initiated', 'processed', 'failed')),
  CONSTRAINT refunds_reason_check CHECK (char_length(reason) BETWEEN 3 AND 200),
  CONSTRAINT refunds_processed_check CHECK ((status = 'processed') = (processed_at IS NOT NULL)),
  CONSTRAINT refunds_key_length_check CHECK (char_length(idempotency_key) BETWEEN 16 AND 128)
);
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE UNIQUE INDEX refunds_gateway_idx ON refunds (gateway_refund_id) WHERE gateway_refund_id IS NOT NULL;
CREATE UNIQUE INDEX refunds_idempotency_idx ON refunds (idempotency_key);
CREATE INDEX refunds_payment_idx ON refunds (payment_id, created_at);

-- Invoice numbers are sequential per financial year (April to March, for example 2026-27). The
-- counter row is locked while a number is taken, so two invoices never share a number and there
-- are no gaps from a failed attempt that rolled back.
CREATE TABLE invoice_counters (
  financial_year  text PRIMARY KEY,
  last_number     integer NOT NULL DEFAULT 0,
  CONSTRAINT invoice_counters_year_check CHECK (financial_year ~ '^\d{4}-\d{2}$')
);

CREATE TABLE invoices (
  id              uuid PRIMARY KEY,
  payment_id      uuid        NOT NULL REFERENCES payments (id),
  pdf_file_id     uuid        REFERENCES files (id),
  invoice_no      text        NOT NULL,
  financial_year  text        NOT NULL,
  tax_paise       integer     NOT NULL DEFAULT 0,
  total_paise     integer     NOT NULL,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_year_check CHECK (financial_year ~ '^\d{4}-\d{2}$'),
  CONSTRAINT invoices_amount_check CHECK (tax_paise >= 0 AND total_paise > 0 AND tax_paise <= total_paise)
);
CREATE UNIQUE INDEX invoices_no_idx ON invoices (invoice_no);
-- One invoice per payment.
CREATE UNIQUE INDEX invoices_payment_idx ON invoices (payment_id);

-- Every rupee that moves between the patient, the doctor and the platform. Positive amounts are
-- owed to the party named by the entry type, negative ones reverse an earlier entry. A capture
-- writes its two entries once and a refund writes its reversals once (unique indexes).
CREATE TABLE earnings_ledger (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doctor_id     uuid        NOT NULL REFERENCES doctors (id),
  payment_id    uuid        NOT NULL REFERENCES payments (id),
  refund_id     uuid        REFERENCES refunds (id),
  entry_type    text        NOT NULL,
  amount_paise  bigint      NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_type_check CHECK (entry_type IN
    ('doctor_share', 'platform_fee', 'doctor_share_reversal', 'platform_fee_reversal', 'payout')),
  CONSTRAINT ledger_sign_check CHECK (
    CASE
      WHEN entry_type IN ('doctor_share', 'platform_fee') THEN amount_paise >= 0
      ELSE amount_paise <= 0
    END),
  CONSTRAINT ledger_refund_check CHECK (
    (entry_type IN ('doctor_share_reversal', 'platform_fee_reversal')) = (refund_id IS NOT NULL))
);
CREATE UNIQUE INDEX ledger_capture_once_idx ON earnings_ledger (payment_id, entry_type)
  WHERE entry_type IN ('doctor_share', 'platform_fee');
CREATE UNIQUE INDEX ledger_refund_once_idx ON earnings_ledger (refund_id, entry_type) WHERE refund_id IS NOT NULL;
CREATE INDEX ledger_doctor_idx ON earnings_ledger (doctor_id, id);
CREATE INDEX ledger_payment_idx ON earnings_ledger (payment_id);
CREATE TRIGGER earnings_ledger_append_only BEFORE UPDATE OR DELETE ON earnings_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER earnings_ledger_no_truncate BEFORE TRUNCATE ON earnings_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
REVOKE UPDATE, DELETE, TRUNCATE ON earnings_ledger FROM app;

CREATE TABLE payouts (
  id            uuid PRIMARY KEY,
  doctor_id     uuid        NOT NULL REFERENCES doctors (id),
  amount_paise  bigint      NOT NULL,
  status        text        NOT NULL DEFAULT 'processing',
  period_start  date        NOT NULL,
  period_end    date        NOT NULL,
  paid_on       date,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payouts_amount_check CHECK (amount_paise >= 0),
  CONSTRAINT payouts_status_check CHECK (status IN ('processing', 'paid', 'on_hold')),
  CONSTRAINT payouts_period_check CHECK (period_end >= period_start),
  CONSTRAINT payouts_paid_check CHECK ((status = 'paid') = (paid_on IS NOT NULL)),
  CONSTRAINT payouts_note_check CHECK (note IS NULL OR char_length(note) <= 300)
);
CREATE TRIGGER payouts_set_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- A doctor is paid once for a period.
CREATE UNIQUE INDEX payouts_period_idx ON payouts (doctor_id, period_start, period_end);

CREATE TABLE referrals (
  id                uuid PRIMARY KEY,
  referrer_user_id  uuid        NOT NULL REFERENCES users (id),
  referred_user_id  uuid        NOT NULL REFERENCES users (id),
  reward_paise      integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_status_check CHECK (status IN ('pending', 'rewarded', 'rejected')),
  CONSTRAINT referrals_reward_check CHECK (reward_paise >= 0),
  CONSTRAINT referrals_self_check CHECK (referrer_user_id <> referred_user_id)
);
-- A person can be referred only once.
CREATE UNIQUE INDEX referrals_referred_idx ON referrals (referred_user_id);
CREATE INDEX referrals_referrer_idx ON referrals (referrer_user_id, created_at DESC);
