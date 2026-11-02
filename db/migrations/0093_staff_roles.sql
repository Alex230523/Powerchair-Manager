-- 7: staff roles, a model of rights on top of the existing grants (never a
-- second authorization model). A person's effective grants stay in
-- role_assignment.grants: the union of his roles' rights, plus his own
-- additions, minus his own removals (« personnalisé »). Additive.

CREATE TABLE IF NOT EXISTS staff_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  -- The proposed roles keep their key (head-coach, assistant…); the club's own have none.
  key text CHECK (key IS NULL OR key ~ '^[a-z-]{2,40}$'),
  name jsonb NOT NULL CHECK (length(name->>'fr') BETWEEN 2 AND 80),
  description jsonb NOT NULL DEFAULT '{}',
  icon text NOT NULL DEFAULT 'team' CHECK (length(icon) <= 40),
  grants text[] NOT NULL DEFAULT '{}',
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'own_teams')),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
DO $$ BEGIN
  ALTER TABLE staff_role ADD CONSTRAINT staff_role_grants_check CHECK (grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS staff_role_key ON staff_role(organization_id, key) WHERE key IS NOT NULL;

CREATE TABLE IF NOT EXISTS mandate_staff_role (
  mandate_id uuid NOT NULL REFERENCES role_assignment(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  PRIMARY KEY (mandate_id, role_id),
  FOREIGN KEY (role_id, organization_id) REFERENCES staff_role(id, organization_id) ON DELETE CASCADE
);

ALTER TABLE role_assignment
  ADD COLUMN IF NOT EXISTS grants_added text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS grants_removed text[] NOT NULL DEFAULT '{}';

-- 4: an invitation may carry the roles chosen first.
ALTER TABLE invitation ADD COLUMN IF NOT EXISTS staff_role_ids uuid[] NOT NULL DEFAULT '{}';
