-- Staff accounts with roles, and sign in sessions for passengers and staff
-- (SRS RRS-SR-003). Staff sign in with a password and a time based one time
-- code (second factor). Counter sessions lock after 5 minutes idle.

CREATE TABLE staff (
  id               SERIAL PRIMARY KEY,
  username         VARCHAR(40) NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  role             VARCHAR(8) NOT NULL CHECK (role IN ('CLERK', 'ADMIN', 'TTE')),
  password_hash    TEXT NOT NULL,
  totp_secret      TEXT NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ
);

-- Only a hash of each session token is stored, so a database leak cannot be
-- used to sign in.
CREATE TABLE sessions (
  id            SERIAL PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  kind          VARCHAR(10) NOT NULL CHECK (kind IN ('PASSENGER', 'STAFF')),
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  staff_id      INT REFERENCES staff(id) ON DELETE CASCADE,
  role          VARCHAR(10) NOT NULL,
  mfa_passed    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  CHECK ((kind = 'PASSENGER' AND user_id IS NOT NULL) OR (kind = 'STAFF' AND staff_id IS NOT NULL))
);
