-- Reviews and favorites (P4-10, docs/er_model.md part 6).
--
-- A review belongs to one completed appointment, written by the account that booked it. It starts
-- pending; only published reviews are public. The doctor's rating average and count are kept on
-- the doctor row so listings do not average on every request; they are recomputed from the
-- published reviews whenever a review is published or hidden, so they cannot drift for long.

CREATE TABLE reviews (
  id              uuid PRIMARY KEY,
  appointment_id  uuid        NOT NULL REFERENCES appointments (id),
  doctor_id       uuid        NOT NULL REFERENCES doctors (id),
  patient_id      uuid        NOT NULL REFERENCES patients (id),
  author_user_id  uuid        NOT NULL REFERENCES users (id),
  rating          smallint    NOT NULL,
  comment         text,
  status          text        NOT NULL DEFAULT 'pending',
  moderated_by    uuid        REFERENCES users (id),
  moderated_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_comment_check CHECK (comment IS NULL OR char_length(comment) BETWEEN 3 AND 1000),
  CONSTRAINT reviews_status_check CHECK (status IN ('pending', 'published', 'hidden')),
  CONSTRAINT reviews_moderated_check CHECK ((status = 'pending') = (moderated_by IS NULL AND moderated_at IS NULL))
);
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- One review per appointment.
CREATE UNIQUE INDEX reviews_appointment_idx ON reviews (appointment_id);
-- The public list: a doctor's published reviews, newest first.
CREATE INDEX reviews_public_idx ON reviews (doctor_id, created_at DESC, id DESC) WHERE status = 'published';
-- The moderation queue, oldest first.
CREATE INDEX reviews_queue_idx ON reviews (created_at, id) WHERE status = 'pending';

ALTER TABLE doctors ADD COLUMN rating_avg numeric(3, 2);
ALTER TABLE doctors ADD COLUMN rating_count integer NOT NULL DEFAULT 0;
ALTER TABLE doctors ADD CONSTRAINT doctors_rating_check CHECK (
  (rating_count = 0) = (rating_avg IS NULL) AND (rating_avg IS NULL OR rating_avg BETWEEN 1 AND 5));

CREATE TABLE doctor_favorites (
  patient_id  uuid        NOT NULL REFERENCES patients (id),
  doctor_id   uuid        NOT NULL REFERENCES doctors (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, doctor_id)
);
CREATE INDEX doctor_favorites_doctor_idx ON doctor_favorites (doctor_id);
