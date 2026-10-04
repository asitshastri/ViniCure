-- Phone recycling defence (P2-18, decision D-019).
--
-- A phone number alone is a weak proof of who a patient is, because mobile numbers are given to
-- new people after a while. A phone-only sign-in that looks risky gets a LIMITED session until
-- the person proves a second method that already existed (Google, recovery code).

-- Which sessions are limited, and how a session was unlocked.
ALTER TABLE auth_sessions
  ADD COLUMN limited       boolean     NOT NULL DEFAULT false,
  ADD COLUMN unlock_method text,
  ADD CONSTRAINT auth_sessions_unlock_method_check
    CHECK (unlock_method IS NULL OR unlock_method IN ('google', 'recovery_code', 'new_account'));

-- "This was not me" raised a flag: the next phone-only sign-ins stay limited until a second
-- method is proven (the flag is cleared then).
ALTER TABLE users ADD COLUMN force_step_up_at timestamptz;

-- A friendly name for the device list ("Chrome on Windows").
ALTER TABLE trusted_devices ADD COLUMN label text;
-- Looking up a device by its cookie hash is by the unique index on device_hash.
-- The list for one person:
CREATE INDEX trusted_devices_live_idx ON trusted_devices (user_id) WHERE revoked_at IS NULL;

-- A notice sent after a sign-in from a new device carries a one-time "not me" link. Only the
-- hash of the link token is stored.
CREATE TABLE signin_alerts (
  id          uuid PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id  uuid,
  token_hash  text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX signin_alerts_user_idx ON signin_alerts (user_id, created_at DESC);
