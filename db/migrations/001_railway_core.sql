-- Reference data the whole system reads: stations, trains, routes, coaches,
-- berths, dated train runs, and the policy settings that must change without
-- a code release (SAD ADR-02). Feature tables arrive in later migrations.

CREATE TABLE stations (
  code        VARCHAR(8) PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE trains (
  id          SERIAL PRIMARY KEY,
  number      VARCHAR(10) NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  -- seven characters, Monday first, 1 = runs that day, e.g. '1111100'
  runs_on     CHAR(7) NOT NULL CHECK (runs_on ~ '^[01]{7}$')
);

CREATE TABLE train_stops (
  train_id      INT NOT NULL REFERENCES trains(id) ON DELETE CASCADE,
  seq           INT NOT NULL CHECK (seq > 0),
  station_code  VARCHAR(8) NOT NULL REFERENCES stations(code),
  arrives       TIME,
  departs       TIME,
  day_offset    INT NOT NULL DEFAULT 0,
  distance_km   INT NOT NULL CHECK (distance_km >= 0),
  PRIMARY KEY (train_id, seq),
  UNIQUE (train_id, station_code)
);

CREATE TABLE travel_classes (
  code        VARCHAR(4) PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE quotas (
  code        VARCHAR(4) PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE coaches (
  id          SERIAL PRIMARY KEY,
  train_id    INT NOT NULL REFERENCES trains(id) ON DELETE CASCADE,
  coach_no    VARCHAR(6) NOT NULL,
  class_code  VARCHAR(4) NOT NULL REFERENCES travel_classes(code),
  UNIQUE (train_id, coach_no)
);

CREATE TABLE berths (
  id          SERIAL PRIMARY KEY,
  coach_id    INT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  berth_no    INT NOT NULL CHECK (berth_no > 0),
  -- which quota this berth is sold under
  quota_code  VARCHAR(4) NOT NULL REFERENCES quotas(code),
  UNIQUE (coach_id, berth_no)
);

-- One row per train per travel date. Bookings attach to a run, not a train.
CREATE TABLE train_runs (
  id          SERIAL PRIMARY KEY,
  train_id    INT NOT NULL REFERENCES trains(id) ON DELETE CASCADE,
  run_date    DATE NOT NULL,
  chart_prepared BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (train_id, run_date)
);

-- RAC positions per class per run (F-007).
CREATE TABLE rac_capacity (
  train_id    INT NOT NULL REFERENCES trains(id) ON DELETE CASCADE,
  class_code  VARCHAR(4) NOT NULL REFERENCES travel_classes(code),
  positions   INT NOT NULL CHECK (positions >= 0),
  PRIMARY KEY (train_id, class_code)
);

-- Policy values with an effective date (ADR-02). The row with the latest
-- effective_from that is not in the future is the active value.
CREATE TABLE settings (
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT '2000-01-01',
  PRIMARY KEY (key, effective_from)
);
