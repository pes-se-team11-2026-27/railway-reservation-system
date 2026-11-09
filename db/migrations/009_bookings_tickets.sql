-- Confirmed bookings with a PNR, and the notification outbox
-- (SRS RRS-F-012, RRS-F-013; SAD ADR-03).

-- The passenger who made the hold, and the journey, travel with it: the
-- fare is worked out on the server from the journey (SAD 3.9, tampering),
-- and the ticket goes to the passenger's verified mobile and email.
ALTER TABLE holds
  ADD COLUMN user_id       INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN from_station  VARCHAR(8),
  ADD COLUMN to_station    VARCHAR(8);

CREATE INDEX holds_user ON holds (user_id);

-- Whether a successful payment turned into a booking. FAILED means the money
-- arrived after the berths were gone, so it must be refunded (RRS-F-014).
ALTER TABLE payments
  ADD COLUMN allocation_status VARCHAR(10) CHECK (allocation_status IN ('CONFIRMED', 'FAILED'));

-- One booking per hold and per payment: the unique keys are what make a
-- repeated callback harmless (RRS-F-013).
CREATE TABLE bookings (
  id              SERIAL PRIMARY KEY,
  pnr             CHAR(10) NOT NULL UNIQUE,
  hold_id         INT NOT NULL UNIQUE REFERENCES holds(id) ON DELETE CASCADE,
  payment_tx_ref  TEXT NOT NULL UNIQUE REFERENCES payments(tx_ref),
  status          VARCHAR(10) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactional outbox (SAD ADR-03): a message is written in the same
-- transaction as the booking, then delivered; failed sends are retried.
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  INT REFERENCES bookings(id) ON DELETE CASCADE,
  kind        VARCHAR(20) NOT NULL,
  channel     VARCHAR(5) NOT NULL CHECK (channel IN ('SMS', 'EMAIL')),
  recipient   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  sent_at     TIMESTAMPTZ,
  reference   TEXT
);

CREATE INDEX notifications_pending ON notifications (id) WHERE sent_at IS NULL;
