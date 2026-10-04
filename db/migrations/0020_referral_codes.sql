-- Referral codes (P5-10). Each patient who asks gets one short random code; the referrals table
-- from 0017 records who used whose. A code is random (not derived from the account), so it
-- cannot be worked out from a user id, and it is unique.

CREATE TABLE referral_codes (
  user_id     uuid PRIMARY KEY REFERENCES users (id),
  code        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_code_check CHECK (code ~ '^[A-HJ-NP-Z2-9]{8}$')
);
CREATE UNIQUE INDEX referral_codes_code_idx ON referral_codes (code);

-- When the reward was granted (a rewarded referral has a time, any other has none).
ALTER TABLE referrals ADD COLUMN rewarded_at timestamptz;
ALTER TABLE referrals ADD CONSTRAINT referrals_rewarded_check
  CHECK ((status = 'rewarded') = (rewarded_at IS NOT NULL));
