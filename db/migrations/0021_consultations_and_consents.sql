-- Video consultations (P6-01) and the consent records they depend on (P6-05; Phase 9 adds the
-- management screens, data requests and incidents).
--
-- consent_policies  the exact text a person agreed to, with its hash, per kind, version and language.
--                   The texts themselves come from legal (P9-10); until then none is active and
--                   anything that needs a consent stays closed.
-- user_consents     who agreed to which version, for which patient, when and from where. A consent
--                   is withdrawn by setting `withdrawn_at`; rows are never deleted.
-- consultations     one video session per appointment. The room name is random and unrelated to the
--                   appointment id.
-- consultation_participants  one numeric provider UID per person per consultation; a token is built
--                   for that UID and room only, and can be revoked.
-- consultation_recordings    recordings (feature flag, off by default) with both consents.

CREATE TABLE consent_policies (
  id              uuid PRIMARY KEY,
  kind            text        NOT NULL,
  version         text        NOT NULL,
  language        text        NOT NULL DEFAULT 'en',
  body            text        NOT NULL,
  content_hash    text        NOT NULL,
  effective_from  date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_policies_kind_check CHECK (kind IN
    ('privacy', 'terms', 'telemedicine', 'video', 'recording', 'ai_triage', 'marketing')),
  CONSTRAINT consent_policies_language_check CHECK (language IN ('en', 'hi', 'gu')),
  CONSTRAINT consent_policies_version_check CHECK (char_length(version) BETWEEN 1 AND 40),
  CONSTRAINT consent_policies_body_check CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT consent_policies_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX consent_policies_version_idx ON consent_policies (kind, version, language);
CREATE INDEX consent_policies_current_idx ON consent_policies (kind, effective_from DESC);
-- A published policy text is never edited: a change is a new version.
CREATE TRIGGER consent_policies_append_only BEFORE UPDATE OR DELETE ON consent_policies
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER consent_policies_no_truncate BEFORE TRUNCATE ON consent_policies
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
REVOKE UPDATE, DELETE, TRUNCATE ON consent_policies FROM app;

CREATE TABLE user_consents (
  id                uuid PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES users (id),
  patient_id        uuid        REFERENCES patients (id),
  policy_id         uuid        NOT NULL REFERENCES consent_policies (id),
  given_by_user_id  uuid        REFERENCES users (id),
  granted           boolean     NOT NULL DEFAULT true,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  withdrawn_at      timestamptz,
  ip                inet,
  CONSTRAINT user_consents_withdrawn_check CHECK (withdrawn_at IS NULL OR withdrawn_at >= granted_at)
);
-- One live consent per person (or patient) and policy.
CREATE UNIQUE INDEX user_consents_live_idx ON user_consents
  (user_id, COALESCE(patient_id, '00000000-0000-0000-0000-000000000000'::uuid), policy_id)
  WHERE granted AND withdrawn_at IS NULL;
CREATE INDEX user_consents_user_idx ON user_consents (user_id, granted_at DESC);
CREATE INDEX user_consents_patient_idx ON user_consents (patient_id) WHERE patient_id IS NOT NULL;
-- Only the withdrawal time can change, once; nothing is deleted.
CREATE FUNCTION user_consents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consent records cannot be deleted';
  END IF;
  IF (NEW.id, NEW.user_id, NEW.patient_id, NEW.policy_id, NEW.given_by_user_id, NEW.granted, NEW.granted_at, NEW.ip)
       IS DISTINCT FROM
     (OLD.id, OLD.user_id, OLD.patient_id, OLD.policy_id, OLD.given_by_user_id, OLD.granted, OLD.granted_at, OLD.ip)
     OR OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'a consent record can only be withdrawn, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_consents_guard BEFORE UPDATE OR DELETE ON user_consents
  FOR EACH ROW EXECUTE FUNCTION user_consents_guard();
CREATE TRIGGER user_consents_no_truncate BEFORE TRUNCATE ON user_consents
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
REVOKE DELETE, TRUNCATE ON user_consents FROM app;
REVOKE UPDATE ON user_consents FROM app;
GRANT UPDATE (withdrawn_at) ON user_consents TO app;

CREATE TABLE consultations (
  id                 uuid PRIMARY KEY,
  appointment_id     uuid        NOT NULL REFERENCES appointments (id),
  provider           text        NOT NULL,
  provider_room_ref  text        NOT NULL,
  status             text        NOT NULL DEFAULT 'pending',
  started_at         timestamptz,
  ended_at           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultations_status_check CHECK (status IN ('pending', 'live', 'ended', 'abandoned')),
  CONSTRAINT consultations_provider_check CHECK (provider ~ '^[a-z0-9_]{2,30}$'),
  -- The room name is random; its shape is checked so nothing guessable or derived can be stored.
  CONSTRAINT consultations_room_check CHECK (provider_room_ref ~ '^[A-Za-z0-9_-]{16,64}$'),
  CONSTRAINT consultations_times_check CHECK (
    CASE status
      WHEN 'pending' THEN started_at IS NULL AND ended_at IS NULL
      WHEN 'live' THEN started_at IS NOT NULL AND ended_at IS NULL
      WHEN 'ended' THEN started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at >= started_at
      ELSE ended_at IS NOT NULL
    END)
);
CREATE TRIGGER consultations_set_updated_at BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE UNIQUE INDEX consultations_appointment_idx ON consultations (appointment_id);
CREATE UNIQUE INDEX consultations_room_idx ON consultations (provider_room_ref);
CREATE INDEX consultations_open_idx ON consultations (created_at) WHERE status IN ('pending', 'live');

CREATE TABLE consultation_participants (
  id                uuid PRIMARY KEY,
  consultation_id   uuid        NOT NULL REFERENCES consultations (id),
  user_id           uuid        NOT NULL REFERENCES users (id),
  role              text        NOT NULL,
  provider_uid      bigint      NOT NULL,
  joined_at         timestamptz,
  left_at           timestamptz,
  token_expires_at  timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultation_participants_role_check CHECK (role IN ('patient', 'doctor')),
  -- Agora user ids are unsigned 32-bit numbers and 0 means "let the service choose".
  CONSTRAINT consultation_participants_uid_check CHECK (provider_uid BETWEEN 1 AND 4294967295),
  CONSTRAINT consultation_participants_left_check CHECK (left_at IS NULL OR (joined_at IS NOT NULL AND left_at >= joined_at))
);
CREATE UNIQUE INDEX consultation_participants_user_idx ON consultation_participants (consultation_id, user_id);
CREATE UNIQUE INDEX consultation_participants_uid_idx ON consultation_participants (consultation_id, provider_uid);

CREATE TABLE consultation_recordings (
  id                   uuid PRIMARY KEY,
  consultation_id      uuid        NOT NULL REFERENCES consultations (id),
  file_id              uuid        REFERENCES files (id),
  provider_recording_ref text,
  patient_consent_id   uuid        NOT NULL REFERENCES user_consents (id),
  doctor_consent_id    uuid        NOT NULL REFERENCES user_consents (id),
  status               text        NOT NULL DEFAULT 'recording',
  retention_until      date        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT consultation_recordings_status_check CHECK (status IN ('recording', 'stored', 'failed')),
  CONSTRAINT consultation_recordings_consents_check CHECK (patient_consent_id <> doctor_consent_id),
  CONSTRAINT consultation_recordings_stored_check CHECK ((status = 'stored') = (file_id IS NOT NULL))
);
CREATE INDEX consultation_recordings_consultation_idx ON consultation_recordings (consultation_id);
CREATE INDEX consultation_recordings_retention_idx ON consultation_recordings (retention_until) WHERE deleted_at IS NULL;
