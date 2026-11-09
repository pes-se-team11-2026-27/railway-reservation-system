-- Append only record of privileged actions (SRS RRS-F-020).
-- A database trigger refuses every UPDATE, DELETE and TRUNCATE, so even a
-- bug or a direct database session cannot quietly change the record.

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN
                    ('FARE_CHANGE', 'QUOTA_CHANGE', 'MANUAL_REFUND', 'CHART_EDIT', 'CLERK_OVERRIDE')),
  target          TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}',
  correlation_id  TEXT
);

CREATE INDEX audit_log_actor_at ON audit_log (actor, at);
CREATE INDEX audit_log_at ON audit_log (at);

CREATE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
