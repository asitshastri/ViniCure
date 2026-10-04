-- Appointments and their status history (P4-05, docs/er_model.md part 2).
--
-- The no_double_booking exclusion constraint is the final guard: whatever the application or a
-- cache says, the database refuses a second active appointment for a doctor over the same
-- time. "Active" means held, scheduled or in progress; an expired or cancelled one frees the slot.
-- fee_paise is copied from the doctor's fee when the slot is held; payments use it, never a
-- client amount. reason_enc is encrypted in the application (free-text symptoms).

CREATE TABLE appointments (
  id                        uuid PRIMARY KEY,
  patient_id                uuid        NOT NULL REFERENCES patients (id),
  doctor_id                 uuid        NOT NULL REFERENCES doctors (id),
  booked_by_user_id         uuid        NOT NULL REFERENCES users (id),
  start_at                  timestamptz NOT NULL,
  end_at                    timestamptz NOT NULL,
  mode                      text        NOT NULL DEFAULT 'video',
  status                    text        NOT NULL,
  fee_paise                 integer     NOT NULL,
  hold_expires_at           timestamptz,
  reason_enc                text,
  attending_adult_name      text,
  attending_adult_relation  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_mode_check CHECK (mode IN ('video')),
  CONSTRAINT appointments_status_check CHECK (status IN
    ('held', 'scheduled', 'in_progress', 'completed', 'cancelled_by_patient',
     'cancelled_by_doctor', 'cancelled_by_admin', 'expired', 'no_show')),
  CONSTRAINT appointments_range_check CHECK (end_at > start_at),
  CONSTRAINT appointments_fee_check CHECK (fee_paise >= 0),
  -- A hold has an expiry; nothing else does.
  CONSTRAINT appointments_hold_check CHECK ((status = 'held') = (hold_expires_at IS NOT NULL)),
  CONSTRAINT appointments_adult_check CHECK (
    (attending_adult_name IS NULL) = (attending_adult_relation IS NULL)),
  CONSTRAINT appointments_adult_length_check CHECK (
    attending_adult_name IS NULL OR
    (char_length(attending_adult_name) BETWEEN 2 AND 100 AND char_length(attending_adult_relation) BETWEEN 2 AND 40)),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('held', 'scheduled', 'in_progress'))
);
CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Release expired holds quickly.
CREATE INDEX appointments_held_expiry_idx ON appointments (hold_expires_at) WHERE status = 'held';
CREATE INDEX appointments_doctor_start_idx ON appointments (doctor_id, start_at);
CREATE INDEX appointments_patient_start_idx ON appointments (patient_id, start_at DESC);
CREATE INDEX appointments_booker_idx ON appointments (booked_by_user_id, created_at DESC);

-- Every status change, written in the same statement as the change. Append-only.
CREATE TABLE appointment_status_history (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id  uuid        NOT NULL REFERENCES appointments (id),
  from_status     text,
  to_status       text        NOT NULL,
  changed_by      uuid        REFERENCES users (id),
  reason          text,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT history_reason_length_check CHECK (reason IS NULL OR char_length(reason) <= 200)
);
CREATE INDEX appointment_status_history_idx ON appointment_status_history (appointment_id, id);

CREATE TRIGGER appointment_status_history_append_only
  BEFORE UPDATE OR DELETE ON appointment_status_history
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER appointment_status_history_no_truncate
  BEFORE TRUNCATE ON appointment_status_history
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
REVOKE UPDATE, DELETE, TRUNCATE ON appointment_status_history FROM app;
