-- Seat inventory per train run and berth holds (SRS RRS-F-005, RRS-F-006).
-- One inventory row per berth per run. A berth is HELD while a passenger
-- completes payment and becomes free again when the hold expires.

CREATE TABLE holds (
  id          SERIAL PRIMARY KEY,
  run_id      INT NOT NULL REFERENCES train_runs(id) ON DELETE CASCADE,
  class_code  VARCHAR(4) NOT NULL,
  quota_code  VARCHAR(4) NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
              CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONFIRMED')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
  run_id           INT NOT NULL REFERENCES train_runs(id) ON DELETE CASCADE,
  berth_id         INT NOT NULL REFERENCES berths(id) ON DELETE CASCADE,
  status           VARCHAR(8) NOT NULL DEFAULT 'FREE' CHECK (status IN ('FREE', 'HELD', 'BOOKED')),
  hold_id          INT REFERENCES holds(id) ON DELETE SET NULL,
  hold_expires_at  TIMESTAMPTZ,
  PRIMARY KEY (run_id, berth_id)
);

CREATE TABLE hold_passengers (
  id          SERIAL PRIMARY KEY,
  hold_id     INT NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
  seq         INT NOT NULL,
  name        TEXT NOT NULL,
  age         INT NOT NULL CHECK (age BETWEEN 1 AND 125),
  gender      CHAR(1) NOT NULL CHECK (gender IN ('M', 'F', 'T')),
  status      VARCHAR(3) NOT NULL CHECK (status IN ('CNF', 'RAC', 'WL')),
  berth_id    INT REFERENCES berths(id),
  position    INT,
  UNIQUE (hold_id, seq)
);

CREATE INDEX holds_run_active ON holds (run_id, class_code) WHERE status = 'ACTIVE';
CREATE INDEX hold_passengers_hold ON hold_passengers (hold_id);

-- Inventory for runs that already exist.
INSERT INTO inventory (run_id, berth_id)
SELECT r.id, b.id
  FROM train_runs r
  JOIN coaches c ON c.train_id = r.train_id
  JOIN berths b ON b.coach_id = c.id
ON CONFLICT DO NOTHING;
