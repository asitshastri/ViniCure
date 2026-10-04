-- Doctor directory (P4-01, docs/er_model.md parts 1, 2 and 7): the file registry, specialties,
-- doctors, their KYC documents, weekly working hours and time off.
--
-- A doctor row can exist before the person has an account (an applicant: user_id is NULL and
-- applicant_email / applicant_phone say who applied). Money is integer paise, platform fee is in
-- basis points. Times are timestamptz in UTC; working hours are wall-clock times in India, so
-- start_time and end_time are plain `time` and the service reads them as Asia/Kolkata.

-- Registry of every stored file. The bytes live in object storage under storage_key, a random
-- key; original_name is only for display and is never used as a path.
CREATE TABLE files (
  id             uuid PRIMARY KEY,
  owner_user_id  uuid        NOT NULL REFERENCES users (id),
  patient_id     uuid        REFERENCES patients (id),
  purpose        text        NOT NULL,
  storage_key    text        NOT NULL,
  original_name  text        NOT NULL,
  mime_type      text        NOT NULL,
  size_bytes     bigint      NOT NULL,
  sha256         text        NOT NULL,
  scan_status    text        NOT NULL DEFAULT 'pending',
  scanned_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT files_purpose_check CHECK (purpose IN
    ('kyc', 'patient_document', 'prescription_pdf', 'invoice_pdf', 'recording', 'export')),
  CONSTRAINT files_scan_status_check CHECK (scan_status IN ('pending', 'clean', 'infected', 'error')),
  CONSTRAINT files_size_check CHECK (size_bytes > 0),
  CONSTRAINT files_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT files_storage_key_check CHECK (storage_key ~ '^[A-Za-z0-9/_-]{8,200}$'),
  CONSTRAINT files_name_length_check CHECK (char_length(original_name) BETWEEN 1 AND 255),
  CONSTRAINT files_scanned_check CHECK ((scan_status IN ('pending')) = (scanned_at IS NULL))
);
CREATE UNIQUE INDEX files_storage_key_idx ON files (storage_key);
CREATE INDEX files_owner_idx ON files (owner_user_id);
CREATE INDEX files_patient_idx ON files (patient_id) WHERE patient_id IS NOT NULL;
-- The scan worker's queue.
CREATE INDEX files_unscanned_idx ON files (created_at) WHERE scan_status = 'pending' AND deleted_at IS NULL;

CREATE TABLE specialties (
  id    smallint PRIMARY KEY,
  name  text NOT NULL,
  CONSTRAINT specialties_name_length_check CHECK (char_length(name) BETWEEN 2 AND 80)
);
CREATE UNIQUE INDEX specialties_name_idx ON specialties (lower(name));

CREATE TABLE doctors (
  id                    uuid PRIMARY KEY,
  user_id               uuid        REFERENCES users (id),
  applicant_email       text,
  applicant_phone       text,
  display_name          text        NOT NULL,
  registration_no       text        NOT NULL,
  registration_council  text        NOT NULL,
  qualifications        text        NOT NULL,
  languages             text[]      NOT NULL DEFAULT '{}',
  kyc_status            text        NOT NULL DEFAULT 'pending',
  status                text        NOT NULL DEFAULT 'pending',
  consultation_fee_paise integer    NOT NULL DEFAULT 0,
  platform_fee_bps      integer     NOT NULL DEFAULT 0,
  hpr_id                text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctors_kyc_status_check CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT doctors_status_check CHECK (status IN ('pending', 'active', 'suspended')),
  CONSTRAINT doctors_name_length_check CHECK (char_length(display_name) BETWEEN 2 AND 100),
  CONSTRAINT doctors_registration_no_check CHECK (char_length(registration_no) BETWEEN 3 AND 40),
  CONSTRAINT doctors_registration_council_check CHECK (char_length(registration_council) BETWEEN 2 AND 120),
  CONSTRAINT doctors_qualifications_check CHECK (char_length(qualifications) BETWEEN 2 AND 300),
  CONSTRAINT doctors_languages_check CHECK (cardinality(languages) <= 12),
  CONSTRAINT doctors_fee_check CHECK (consultation_fee_paise BETWEEN 0 AND 10000000),
  CONSTRAINT doctors_platform_fee_check CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  -- Somebody must be identifiable: an account, or the applicant's contact.
  CONSTRAINT doctors_identity_check CHECK (
    user_id IS NOT NULL OR applicant_email IS NOT NULL OR applicant_phone IS NOT NULL),
  -- A doctor is only listed once the registration has been checked.
  CONSTRAINT doctors_active_needs_kyc_check CHECK (status <> 'active' OR kyc_status = 'approved')
);
CREATE TRIGGER doctors_set_updated_at BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX doctors_user_idx ON doctors (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX doctors_hpr_idx ON doctors (hpr_id) WHERE hpr_id IS NOT NULL;
-- One registration per council: the same number cannot be claimed by two doctors.
CREATE UNIQUE INDEX doctors_registration_idx
  ON doctors (lower(registration_council), lower(registration_no));
-- The public listing and the admin queue.
CREATE INDEX doctors_active_idx ON doctors (display_name, id) WHERE status = 'active';
CREATE INDEX doctors_kyc_queue_idx ON doctors (created_at) WHERE kyc_status = 'pending';

CREATE TABLE doctor_specialties (
  doctor_id     uuid     NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  specialty_id  smallint NOT NULL REFERENCES specialties (id),
  is_primary    boolean  NOT NULL DEFAULT false,
  PRIMARY KEY (doctor_id, specialty_id)
);
CREATE UNIQUE INDEX doctor_specialties_one_primary_idx ON doctor_specialties (doctor_id) WHERE is_primary;
CREATE INDEX doctor_specialties_specialty_idx ON doctor_specialties (specialty_id, doctor_id);

CREATE TABLE doctor_kyc_documents (
  id           uuid PRIMARY KEY,
  doctor_id    uuid        NOT NULL REFERENCES doctors (id),
  file_id      uuid        NOT NULL REFERENCES files (id),
  doc_type     text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  reviewed_by  uuid        REFERENCES users (id),
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_kyc_doc_type_check CHECK (doc_type IN
    ('registration_certificate', 'degree_certificate', 'photo_id', 'photo')),
  CONSTRAINT doctor_kyc_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT doctor_kyc_reviewed_check CHECK (
    (status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))
);
-- A file backs one document, once.
CREATE UNIQUE INDEX doctor_kyc_file_idx ON doctor_kyc_documents (file_id);
CREATE INDEX doctor_kyc_doctor_idx ON doctor_kyc_documents (doctor_id, created_at);

CREATE TABLE doctor_availability_rules (
  id            uuid PRIMARY KEY,
  doctor_id     uuid        NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  weekday       smallint    NOT NULL,
  start_time    time        NOT NULL,
  end_time      time        NOT NULL,
  slot_minutes  smallint    NOT NULL,
  valid_from    date        NOT NULL,
  valid_to      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT availability_hours_check CHECK (end_time > start_time),
  CONSTRAINT availability_slot_check CHECK (slot_minutes IN (10, 15, 20, 30, 45, 60)),
  CONSTRAINT availability_whole_slots_check CHECK (
    (extract(epoch FROM (end_time - start_time)) / 60)::int % slot_minutes = 0),
  CONSTRAINT availability_validity_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  -- Two rules for the same day cannot overlap while both are valid.
  CONSTRAINT availability_no_overlap EXCLUDE USING gist (
    doctor_id WITH =,
    weekday WITH =,
    daterange(valid_from, valid_to, '[]') WITH &&,
    tsrange(DATE '2000-01-01' + start_time, DATE '2000-01-01' + end_time) WITH &&
  )
);
CREATE INDEX availability_doctor_idx ON doctor_availability_rules (doctor_id, weekday);

CREATE TABLE doctor_time_off (
  id          uuid PRIMARY KEY,
  doctor_id   uuid        NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_off_range_check CHECK (end_at > start_at),
  CONSTRAINT time_off_reason_check CHECK (reason IS NULL OR char_length(reason) <= 200)
);
CREATE INDEX time_off_doctor_idx ON doctor_time_off (doctor_id, start_at);
