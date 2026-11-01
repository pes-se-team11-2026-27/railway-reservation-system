-- Fare rules per class (SRS RRS-F-010), with an effective date so a new rule
-- can be set up in advance (SAD ADR-02). Money is stored in paise.
-- No foreign key to travel_classes on purpose: the demo seed truncates that
-- table, and fare rules must survive a reseed.
CREATE TABLE fare_rules (
  class_code         VARCHAR(4) NOT NULL,
  paise_per_km       INT NOT NULL CHECK (paise_per_km > 0),
  min_km             INT NOT NULL CHECK (min_km >= 0),
  reservation_paise  INT NOT NULL CHECK (reservation_paise >= 0),
  gst_bps            INT NOT NULL CHECK (gst_bps >= 0),   -- basis points, 500 = 5%
  convenience_paise  INT NOT NULL CHECK (convenience_paise >= 0),
  effective_from     TIMESTAMPTZ NOT NULL DEFAULT '2000-01-01',
  PRIMARY KEY (class_code, effective_from)
);

INSERT INTO fare_rules (class_code, paise_per_km, min_km, reservation_paise, gst_bps, convenience_paise) VALUES
  ('SL', 45, 200, 2000, 0, 1500),
  ('3A', 120, 300, 4000, 500, 1500);
