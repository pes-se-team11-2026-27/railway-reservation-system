-- Sign in lockout (SRS RRS-SR-005): count failed attempts and lock the
-- account for a while after too many.
ALTER TABLE users
  ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until TIMESTAMPTZ;
