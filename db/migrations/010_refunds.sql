-- Refunds (SRS RRS-F-014, and later F-015 cancellations and F-017 chart
-- waitlist refunds). A payment is refunded at most once for each reason:
-- the unique key makes a repeated trigger harmless.

CREATE TABLE refunds (
  id            SERIAL PRIMARY KEY,
  refund_ref    TEXT NOT NULL UNIQUE,
  tx_ref        TEXT NOT NULL REFERENCES payments(tx_ref),
  booking_id    INT REFERENCES bookings(id),
  amount_paise  INT NOT NULL CHECK (amount_paise >= 0),
  reason        VARCHAR(20) NOT NULL CHECK (reason IN ('ALLOCATION_FAILED', 'CANCELLATION', 'CHART_WAITLIST')),
  status        VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  gateway_ref   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX refunds_once_per_reason ON refunds (tx_ref, reason);
