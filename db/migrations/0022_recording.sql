-- Consultation recording (P6-08), behind FEATURE_RECORDING (off by default).
--
-- A recording needs the agreement of both people, for that one consultation:
--   * user_consents gets `consultation_id`. A `recording` consent is given for one consultation and
--     says nothing about the next one. Consents of every other kind leave it empty.
--   * a trigger refuses a recording row unless both consent ids are `recording` consents for this
--     same consultation, one from the patient's account and one from the doctor, neither withdrawn.
-- consultation_recordings gets the storage key the provider was told to write to, a `stopped`
-- state (the call is over, the file has not been checked yet) and the time it was stopped.

ALTER TABLE user_consents ADD COLUMN consultation_id uuid REFERENCES consultations (id);
CREATE INDEX user_consents_consultation_idx ON user_consents (consultation_id)
  WHERE consultation_id IS NOT NULL;

-- One live consent per person (or patient), policy and consultation.
DROP INDEX user_consents_live_idx;
CREATE UNIQUE INDEX user_consents_live_idx ON user_consents
  (user_id, COALESCE(patient_id, '00000000-0000-0000-0000-000000000000'::uuid), policy_id,
   COALESCE(consultation_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE granted AND withdrawn_at IS NULL;

-- Same guard as before, now also covering the new column.
CREATE OR REPLACE FUNCTION user_consents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consent records cannot be deleted';
  END IF;
  IF (NEW.id, NEW.user_id, NEW.patient_id, NEW.policy_id, NEW.given_by_user_id, NEW.granted, NEW.granted_at, NEW.ip, NEW.consultation_id)
       IS DISTINCT FROM
     (OLD.id, OLD.user_id, OLD.patient_id, OLD.policy_id, OLD.given_by_user_id, OLD.granted, OLD.granted_at, OLD.ip, OLD.consultation_id)
     OR OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'a consent record can only be withdrawn, once';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE consultation_recordings
  ADD COLUMN object_key text,
  ADD COLUMN stopped_at timestamptz;
ALTER TABLE consultation_recordings DROP CONSTRAINT consultation_recordings_status_check;
ALTER TABLE consultation_recordings ADD CONSTRAINT consultation_recordings_status_check
  CHECK (status IN ('recording', 'stopped', 'stored', 'failed'));
ALTER TABLE consultation_recordings ADD CONSTRAINT consultation_recordings_key_check
  CHECK (object_key IS NULL OR object_key ~ '^recording/[0-9]{4}/[0-9a-f-]{36}\.mp4$');
ALTER TABLE consultation_recordings ADD CONSTRAINT consultation_recordings_stopped_check
  CHECK ((status IN ('stopped', 'stored')) = (stopped_at IS NOT NULL) OR status = 'failed');
-- One recording at a time per consultation.
CREATE UNIQUE INDEX consultation_recordings_active_idx ON consultation_recordings (consultation_id)
  WHERE status = 'recording';

-- Both consents must be live `recording` consents for this consultation, from the two people in it.
CREATE FUNCTION consultation_recordings_consents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  patient_ok boolean;
  doctor_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM user_consents uc
      JOIN consent_policies cp ON cp.id = uc.policy_id
      JOIN consultations c ON c.id = uc.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      JOIN patients p ON p.id = a.patient_id
     WHERE uc.id = NEW.patient_consent_id AND cp.kind = 'recording' AND uc.granted
       AND uc.withdrawn_at IS NULL AND uc.consultation_id = NEW.consultation_id
       AND uc.user_id = p.account_user_id)
    INTO patient_ok;
  SELECT EXISTS (
    SELECT 1
      FROM user_consents uc
      JOIN consent_policies cp ON cp.id = uc.policy_id
      JOIN consultations c ON c.id = uc.consultation_id
      JOIN appointments a ON a.id = c.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
     WHERE uc.id = NEW.doctor_consent_id AND cp.kind = 'recording' AND uc.granted
       AND uc.withdrawn_at IS NULL AND uc.consultation_id = NEW.consultation_id
       AND uc.user_id = d.user_id)
    INTO doctor_ok;
  IF NOT patient_ok OR NOT doctor_ok THEN
    RAISE EXCEPTION 'a recording needs a live recording consent from the patient and from the doctor, for this consultation'
      USING ERRCODE = '23514', CONSTRAINT = 'consultation_recordings_consents_guard';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consultation_recordings_consents_guard BEFORE INSERT ON consultation_recordings
  FOR EACH ROW EXECUTE FUNCTION consultation_recordings_consents_guard();
