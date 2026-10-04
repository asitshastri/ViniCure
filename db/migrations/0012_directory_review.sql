-- Doctor application and KYC pipeline (P4-02). Adds what the upload and review steps need to
-- the tables from 0011:
--   files.uploaded_at      the client finished the upload and the server checked size and type.
--                          The scan queue only looks at uploaded files; a file that was never
--                          uploaded cannot be scanned and never counts.
--   files.sha256           may be empty until the file is hashed (the hash is not known when the
--                          upload slot is given).
--   review_note            the reviewer's reason shown to the doctor ("please replace the photo").
--                          Plain words for the doctor, never clinical content.

ALTER TABLE files ADD COLUMN uploaded_at timestamptz;
ALTER TABLE files ALTER COLUMN sha256 DROP NOT NULL;
ALTER TABLE files ADD CONSTRAINT files_scanned_needs_upload_check
  CHECK (scan_status = 'pending' OR uploaded_at IS NOT NULL);

DROP INDEX files_unscanned_idx;
CREATE INDEX files_unscanned_idx ON files (uploaded_at)
  WHERE scan_status = 'pending' AND uploaded_at IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE doctor_kyc_documents ADD COLUMN review_note text;
ALTER TABLE doctor_kyc_documents ADD CONSTRAINT doctor_kyc_note_length_check
  CHECK (review_note IS NULL OR char_length(review_note) <= 300);

ALTER TABLE doctors ADD COLUMN review_note text;
ALTER TABLE doctors ADD CONSTRAINT doctors_note_length_check
  CHECK (review_note IS NULL OR char_length(review_note) <= 300);

-- The storage key from the storage module is purpose/year/uuid.ext, so it contains a dot.
-- 0011 forgot to allow one. Two dots in a row are still refused.
ALTER TABLE files DROP CONSTRAINT files_storage_key_check;
ALTER TABLE files ADD CONSTRAINT files_storage_key_check
  CHECK (storage_key ~ '^[A-Za-z0-9/_.-]{8,200}$' AND storage_key !~ '\.\.');
