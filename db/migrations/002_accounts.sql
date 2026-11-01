-- Passenger accounts and one time passwords (SRS RRS-F-001, RRS-F-002).

CREATE TABLE users (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  mobile           VARCHAR(10) NOT NULL,
  email            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  mobile_verified  BOOLEAN NOT NULL DEFAULT false,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active account may hold a mobile number.
CREATE UNIQUE INDEX users_active_mobile ON users (mobile) WHERE active;

CREATE TABLE otp_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_user ON otp_codes (user_id, created_at DESC);
