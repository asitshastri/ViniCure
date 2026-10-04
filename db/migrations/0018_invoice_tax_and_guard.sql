-- Invoices (P5-08). An issued invoice is a legal record: it is never changed or removed, except
-- that its PDF is attached once. The tax rate used is stored on the invoice so a later change of
-- settings never rewrites history. The rate itself (and whether any tax applies) is for the
-- accountant to confirm; it is 0 until then.

ALTER TABLE invoices ADD COLUMN tax_rate_bps integer NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD CONSTRAINT invoices_tax_rate_check
  CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000);

CREATE FUNCTION invoices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices cannot be deleted';
  END IF;
  -- Only the PDF link can be set, once.
  IF (NEW.id, NEW.payment_id, NEW.invoice_no, NEW.financial_year, NEW.tax_paise, NEW.total_paise,
      NEW.issued_at, NEW.tax_rate_bps)
       IS DISTINCT FROM
     (OLD.id, OLD.payment_id, OLD.invoice_no, OLD.financial_year, OLD.tax_paise, OLD.total_paise,
      OLD.issued_at, OLD.tax_rate_bps)
     OR OLD.pdf_file_id IS NOT NULL THEN
    RAISE EXCEPTION 'an issued invoice cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_guard BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();
CREATE TRIGGER invoices_no_truncate BEFORE TRUNCATE ON invoices
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
REVOKE DELETE, TRUNCATE ON invoices FROM app;
-- The app may set the PDF link and nothing else on an existing invoice.
REVOKE UPDATE ON invoices FROM app;
GRANT UPDATE (pdf_file_id) ON invoices TO app;
