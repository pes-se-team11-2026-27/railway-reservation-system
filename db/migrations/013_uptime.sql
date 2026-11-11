-- Availability monitoring (SRS RRS-NF-004: 99.5 percent a month).
-- The server writes one row a minute while it and the database are healthy.
-- A minute with no row is a minute the service was down.
CREATE TABLE uptime_samples (
  minute  TIMESTAMPTZ PRIMARY KEY,
  db_ms   INT NOT NULL
);
