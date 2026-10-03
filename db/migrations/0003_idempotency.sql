-- Safe retries for writes (backend-architecture.md section 5, decision D-017).
-- scope_hash is a hash of caller, route and the client's key; the raw key is never stored.
-- The response body is stored encrypted (response_body_enc).

CREATE TABLE idempotency_keys (
  scope_hash            text        PRIMARY KEY,
  request_hash          text        NOT NULL,
  state                 text        NOT NULL,
  response_status       integer,
  response_content_type text,
  response_body_enc     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  CONSTRAINT idempotency_keys_state_check CHECK (state IN ('in_progress', 'completed'))
);

CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);
