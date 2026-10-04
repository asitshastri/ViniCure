-- Patient profiles (P2-09, docs/er_model.md part 1). One account can manage several profiles:
-- the person themself and family members. Clinical and booking data hang off patients.id.
--
-- is_minor is set by the server from dob, never taken from the client. Deletion is soft
-- (deleted_at): appointments and records that already exist keep pointing at the row.

CREATE TABLE patients (
  id               uuid PRIMARY KEY,
  account_user_id  uuid        NOT NULL REFERENCES users (id),
  relation         text        NOT NULL,
  full_name        text        NOT NULL,
  dob              date        NOT NULL,
  gender           text        NOT NULL,
  address_line     text,
  city             text,
  state            text,
  pincode          text,
  blood_group      text,
  is_minor         boolean     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT patients_relation_check CHECK (relation IN ('self', 'spouse', 'child', 'parent', 'sibling', 'other')),
  CONSTRAINT patients_gender_check CHECK (gender IN ('female', 'male', 'other', 'undisclosed')),
  CONSTRAINT patients_blood_group_check CHECK (
    blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  CONSTRAINT patients_pincode_check CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$'),
  CONSTRAINT patients_name_length_check CHECK (char_length(full_name) BETWEEN 2 AND 100),
  CONSTRAINT patients_dob_check CHECK (dob >= DATE '1900-01-01' AND dob <= CURRENT_DATE)
);
CREATE TRIGGER patients_set_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The list query: one account's live profiles, oldest first.
CREATE INDEX patients_account_idx ON patients (account_user_id, created_at) WHERE deleted_at IS NULL;
-- At most one "self" profile per account.
CREATE UNIQUE INDEX patients_one_self_idx ON patients (account_user_id)
  WHERE relation = 'self' AND deleted_at IS NULL;
-- The same person is not added twice to one account.
CREATE UNIQUE INDEX patients_no_duplicate_idx ON patients (account_user_id, lower(full_name), dob)
  WHERE deleted_at IS NULL;
