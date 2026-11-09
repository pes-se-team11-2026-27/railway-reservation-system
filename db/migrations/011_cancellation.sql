-- Cancellation (SRS RRS-F-015) and promotion (RRS-F-016).
-- A cancelled booking's hold leaves the RAC and waitlist queue.

ALTER TABLE holds DROP CONSTRAINT holds_status_check;
ALTER TABLE holds ADD CONSTRAINT holds_status_check
  CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONFIRMED', 'CANCELLED'));

ALTER TABLE bookings ADD COLUMN cancelled_at TIMESTAMPTZ;
