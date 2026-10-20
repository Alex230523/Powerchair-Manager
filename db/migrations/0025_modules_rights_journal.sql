-- Wave 6: modules a club can switch off, read-only money access, club rights
-- profiles, a detailed rights journal and a journal of health data access.

-- Switched-off modules disappear from menus and their routes refuse; no data
-- is deleted, switching back on restores everything.
ALTER TABLE organization ADD COLUMN disabled_modules text[] NOT NULL DEFAULT '{}'
  CHECK (disabled_modules <@ ARRAY['finance','dues','equipment','matches','licenses','reminders','messages','statistics']::text[]);

-- New delegable permission: read the club accounts and dues without changing them.
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read']::text[]);

-- Profiles the president defines for the club ("Secrétaire", "Kiné"...).
CREATE TABLE rights_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  grants text[] NOT NULL DEFAULT '{}' CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read']::text[]),
  created_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- What a rights change did (before / after), shown in the rights journal.
ALTER TABLE audit_log ADD COLUMN details jsonb;
CREATE INDEX audit_log_org_created ON audit_log(organization_id, created_at DESC);

-- Every reading of health or other confidential data by staff leaves a line.
-- The person themself and their representatives are not logged: it is their data.
CREATE TABLE sensitive_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  actor_id text NOT NULL REFERENCES "user"(id),
  profile_id uuid,
  kind text NOT NULL CHECK (kind IN ('player_health','registration_confidential','sensitive_document','offline_book')),
  resource_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sensitive_access_log_org ON sensitive_access_log(organization_id, created_at DESC);
CREATE INDEX sensitive_access_log_profile ON sensitive_access_log(profile_id, created_at DESC);
