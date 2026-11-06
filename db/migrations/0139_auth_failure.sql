-- Security (06/11/2026), broken authentication: the failed password sign-ins of an address, from any
-- network address, so a guessing spread over many machines stops too. The address is kept as its
-- SHA-256 only. Additive and idempotent.
CREATE TABLE IF NOT EXISTS auth_failure (
  id bigserial PRIMARY KEY,
  email_hash text NOT NULL CHECK (length(email_hash) = 64),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_failure_email ON auth_failure(email_hash, at DESC);
