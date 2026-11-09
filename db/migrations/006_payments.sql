-- Payments through the external gateway's hosted page (SRS RRS-F-011).
-- Only a transaction reference and the gateway's token are stored, never
-- card data (RRS-NF-005, RRS-SR-002). Every callback received is kept, so
-- repeated or late callbacks can be traced (RRS-F-013).

CREATE TABLE payments (
  id             SERIAL PRIMARY KEY,
  tx_ref         TEXT NOT NULL UNIQUE,
  hold_id        INT NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
  amount_paise   INT NOT NULL CHECK (amount_paise > 0),
  status         VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'SUCCESS', 'DECLINED')),
  gateway_token  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payments_hold ON payments (hold_id);

CREATE TABLE payment_callbacks (
  id           BIGSERIAL PRIMARY KEY,
  tx_ref       TEXT NOT NULL,
  status       TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payment_callbacks_tx ON payment_callbacks (tx_ref);
