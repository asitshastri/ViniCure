-- Staff invitations (P2-06). An admin invites a doctor, admin or support person by email. The
-- person follows the emailed link, sets a password and proves their authenticator app; only
-- then is the user created (one statement, see IdentityRepo.completeInvitation).
--
-- The link carries a random token. Only its SHA-256 hash is stored, so a database leak does not
-- hand out working links. A link works once, for 72 hours, and is burnt after 5 wrong codes.

CREATE TABLE invitations (
  id                   uuid PRIMARY KEY,
  email                text        NOT NULL,
  role_code            text        NOT NULL,
  token_hash           text        NOT NULL UNIQUE,
  invited_by           uuid        NOT NULL REFERENCES users (id),
  expires_at           timestamptz NOT NULL,
  -- The authenticator secret and backup codes shown at enrolment, encrypted in the format the
  -- two-factor plugin uses. They move to auth_two_factor when the invitation is accepted.
  pending_totp_secret  text,
  pending_backup_codes text,
  failed_attempts      integer     NOT NULL DEFAULT 0,
  accepted_at          timestamptz,
  accepted_user_id     uuid        REFERENCES users (id),
  revoked_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_lower_check CHECK (email = lower(email)),
  CONSTRAINT invitations_role_check CHECK (role_code IN ('doctor', 'admin', 'support')),
  CONSTRAINT invitations_attempts_check CHECK (failed_attempts >= 0)
);
-- One open invitation per email address: a new one replaces the old.
CREATE UNIQUE INDEX invitations_open_email_idx ON invitations (email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX invitations_invited_by_idx ON invitations (invited_by);
