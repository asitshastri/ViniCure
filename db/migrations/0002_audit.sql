-- Audit log and PHI access log (backend-architecture.md section 14).
-- Both are append-only: the app role can read and insert, never update or delete, and a
-- trigger refuses changes even from the table owner. Retention removes whole old
-- partitions (audit_logs) as the migrator.

CREATE SEQUENCE audit_logs_id_seq;

CREATE TABLE audit_logs (
  id            bigint      NOT NULL DEFAULT nextval('audit_logs_id_seq'),
  actor_user_id uuid,
  action        text        NOT NULL,
  entity_type   text        NOT NULL,
  entity_id     uuid,
  ip            inet,
  user_agent    text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

ALTER SEQUENCE audit_logs_id_seq OWNED BY audit_logs.id;

-- A catch-all so an insert never fails because a monthly partition is missing.
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE INDEX audit_logs_actor_idx  ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, occurred_at DESC);

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, audit_logs_default FROM app;

-- Creates the current month and the next months_ahead months. A scheduled job calls this
-- (P8). New partitions get the same restrictions as the parent.
CREATE FUNCTION ensure_audit_partitions(months_ahead int DEFAULT 2) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  first_day date;
  part      text;
BEGIN
  FOR i IN 0..months_ahead LOOP
    first_day := (date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i))::date;
    part := format('audit_logs_%s', to_char(first_day, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
      part,
      first_day::text || ' 00:00:00+00',
      (first_day + interval '1 month')::date::text || ' 00:00:00+00'
    );
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM app', part);
  END LOOP;
END
$$;

SELECT ensure_audit_partitions(2);

CREATE TABLE phi_access_logs (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid        NOT NULL,
  patient_id    uuid        NOT NULL,
  resource_type text        NOT NULL,
  resource_id   uuid        NOT NULL,
  purpose       text        NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phi_access_logs_purpose_check
    CHECK (purpose IN ('treatment', 'patient_self', 'support_break_glass', 'legal')),
  CONSTRAINT phi_access_logs_resource_check
    CHECK (resource_type IN ('clinical_note', 'prescription', 'vital', 'condition', 'document', 'recording', 'patient_summary'))
);

CREATE INDEX phi_access_patient_time_idx ON phi_access_logs (patient_id, occurred_at DESC);
CREATE INDEX phi_access_actor_time_idx   ON phi_access_logs (actor_user_id, occurred_at DESC);

CREATE TRIGGER phi_access_logs_append_only
  BEFORE UPDATE OR DELETE ON phi_access_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER phi_access_logs_no_truncate
  BEFORE TRUNCATE ON phi_access_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

REVOKE UPDATE, DELETE, TRUNCATE ON phi_access_logs FROM app;
