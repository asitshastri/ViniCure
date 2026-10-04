-- Rescheduling (P4-06): how many times a booking has been moved, so the limit can be enforced
-- in the same statement that moves it.
ALTER TABLE appointments ADD COLUMN reschedule_count smallint NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD CONSTRAINT appointments_reschedule_count_check
  CHECK (reschedule_count BETWEEN 0 AND 10);
