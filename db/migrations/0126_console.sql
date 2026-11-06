-- 05/11/2026 (console, step 1): the operators of the platform, outside every
-- organisation, and the journal of what they do. An operator holds no mandate
-- in a club; the console reads counts and states, every intervention is
-- written here and in the organisation's own audit journal.
CREATE TABLE IF NOT EXISTS platform_operator (
  user_id text PRIMARY KEY REFERENCES "user"(id),
  role text NOT NULL CHECK (role IN ('owner', 'support', 'finance', 'readonly')),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text REFERENCES "user"(id)
);
CREATE TABLE IF NOT EXISTS platform_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL REFERENCES "user"(id),
  organization_id uuid REFERENCES organization(id),
  kind text NOT NULL CHECK (length(kind) BETWEEN 2 AND 60),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_action_recent ON platform_action(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_action_org ON platform_action(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
-- Internal notes on an organisation (never shown to it).
CREATE TABLE IF NOT EXISTS platform_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  operator_id text NOT NULL REFERENCES "user"(id),
  text text NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_note_org ON platform_note(organization_id, created_at DESC);
