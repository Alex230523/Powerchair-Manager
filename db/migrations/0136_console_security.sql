-- Console, series D (06/11/2026): the operators' console sessions journaled, the probable duplicates told
-- to a presidency. Additive and idempotent.

-- Every session an operator uses on the console: first and last call, address and browser as the
-- session carries them. Kept after the session is gone (no foreign key on session).
CREATE TABLE IF NOT EXISTS operator_session_log (
  session_id text PRIMARY KEY,
  operator_id text NOT NULL REFERENCES "user"(id),
  started_at timestamptz NOT NULL,
  first_console_at timestamptz NOT NULL DEFAULT now(),
  last_console_at timestamptz NOT NULL DEFAULT now(),
  ip text NOT NULL DEFAULT '' CHECK (length(ip) <= 64),
  user_agent text NOT NULL DEFAULT '' CHECK (length(user_agent) <= 300),
  calls integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS operator_session_log_operator ON operator_session_log(operator_id, last_console_at DESC);
