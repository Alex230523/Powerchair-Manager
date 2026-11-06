-- 06/11/2026 (console, step 6): the operator's keys for the MCP server
-- (/api/mcp), so an operator plugs their own assistant on the console. A key
-- belongs to one operator, carries scopes, keeps only its hash, counts its
-- calls; revoked, it stops at once. Rate: 60 calls a minute per key.
CREATE TABLE IF NOT EXISTS operator_api_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL REFERENCES "user"(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[a-z0-9]{8}$'),
  key_hash text NOT NULL CHECK (length(key_hash) = 64),
  scopes text[] NOT NULL DEFAULT '{}',
  calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS operator_api_key_owner ON operator_api_key(operator_id, created_at DESC);
CREATE TABLE IF NOT EXISTS operator_api_rate (
  key_id uuid NOT NULL REFERENCES operator_api_key(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
