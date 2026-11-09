-- Chart preparation (SRS RRS-F-017): when the chart was made, and which
-- waitlisted passengers were dropped and refunded at that point.
ALTER TABLE train_runs ADD COLUMN charted_at TIMESTAMPTZ;
ALTER TABLE hold_passengers ADD COLUMN refunded BOOLEAN NOT NULL DEFAULT false;
