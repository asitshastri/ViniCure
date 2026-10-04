-- Data requests (P2-11, docs/er_model.md part 5): a person asks for their data to be exported or
-- erased. P2-11 only records the request; the admin workflow that processes it is P9.
--
-- due_at stays empty until the legal deadline is confirmed by the human (DPDP Rules). Nothing
-- here guesses it. Erasure never happens inside the request: a person handles it, audited.

CREATE TABLE data_requests (
  id            uuid PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES users (id),
  type          text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  due_at        timestamptz,
  completed_at  timestamptz,
  handled_by    uuid        REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_requests_type_check CHECK (type IN ('export', 'erase', 'correct')),
  CONSTRAINT data_requests_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  CONSTRAINT data_requests_completed_check CHECK (
    (status IN ('completed', 'rejected')) = (completed_at IS NOT NULL))
);
CREATE TRIGGER data_requests_set_updated_at BEFORE UPDATE ON data_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX data_requests_user_idx ON data_requests (user_id, created_at DESC);
-- The admin queue: open requests, oldest first.
CREATE INDEX data_requests_open_idx ON data_requests (created_at) WHERE status IN ('pending', 'in_progress');
-- One open request per person and type, so a double click or a replay cannot stack requests.
CREATE UNIQUE INDEX data_requests_one_open_idx ON data_requests (user_id, type)
  WHERE status IN ('pending', 'in_progress');
