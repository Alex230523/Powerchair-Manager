-- Console, series E (06/11/2026): a club's own MCP connector (level 3): keys held by the presidency,
-- read-only scopes, so a president plugs their own Claude on their club. Additive and idempotent.
CREATE TABLE IF NOT EXISTS organization_mcp_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES "user"(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[a-z0-9]{8}$'),
  key_hash text NOT NULL CHECK (length(key_hash) = 64),
  scopes text[] NOT NULL CHECK (scopes <@ ARRAY['club:read', 'calendar:read', 'dues:read']::text[] AND cardinality(scopes) >= 1),
  calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text REFERENCES "user"(id)
);
CREATE INDEX IF NOT EXISTS organization_mcp_key_org ON organization_mcp_key(organization_id, created_at DESC);
CREATE TABLE IF NOT EXISTS organization_mcp_rate (
  key_id uuid NOT NULL REFERENCES organization_mcp_key(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
