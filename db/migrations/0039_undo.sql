-- Undo after an important action (wave 15, C10).
-- A reversible action leaves here what it changed; for two minutes its author
-- can ask the server to put it back, rights checked again, once.
CREATE TABLE undo_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','messageHide','payment')),
  target_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK(expires_at > created_at)
);
CREATE INDEX undo_action_open ON undo_action(user_id,organization_id) WHERE used_at IS NULL;
