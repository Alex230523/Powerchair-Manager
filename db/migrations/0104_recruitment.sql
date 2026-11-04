-- H1: the recruitment of new players. A prospect (no health datum), its
-- dated stages, its trial session (a chair of the club booked for it), its
-- conversion into a player, and the deletion of the prospects not
-- registered after a set delay. A new right, recruitment.manage. Additive
-- and idempotent.
DO $$
DECLARE
  allowed text[] := ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read','tax.identity',
    'federation.referees','federation.competitions','federation.discipline','federation.classification','federation.licences','federation.courses','federation.communication','federation.finance','recruitment.manage'];
BEGIN
  ALTER TABLE role_assignment DROP CONSTRAINT IF EXISTS role_assignment_grants_check;
  EXECUTE format('ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK (grants <@ %L::text[])', allowed);
  ALTER TABLE invitation DROP CONSTRAINT IF EXISTS invitation_grants_check;
  EXECUTE format('ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK (grants <@ %L::text[])', allowed);
  ALTER TABLE staff_role DROP CONSTRAINT IF EXISTS staff_role_grants_check;
  EXECUTE format('ALTER TABLE staff_role ADD CONSTRAINT staff_role_grants_check CHECK (grants <@ %L::text[])', array_remove(allowed, 'tax.identity'));
END $$;

-- Recruitment partners: rehabilitation centres, special schools, associations.
ALTER TABLE contact_organization DROP CONSTRAINT IF EXISTS contact_organization_kind_check;
ALTER TABLE contact_organization ADD CONSTRAINT contact_organization_kind_check CHECK (kind IN ('company', 'public', 'foundation', 'federation', 'supplier', 'venue', 'media', 'rehab', 'school', 'association', 'other'));
ALTER TABLE organization ADD COLUMN IF NOT EXISTS prospect_retention_months integer NOT NULL DEFAULT 24 CHECK (prospect_retention_months BETWEEN 6 AND 60);

CREATE TABLE IF NOT EXISTS prospect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  first_name text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 80),
  last_name text NOT NULL DEFAULT '' CHECK (length(last_name) <= 80),
  minor boolean NOT NULL DEFAULT false,
  approx_age integer CHECK (approx_age IS NULL OR approx_age BETWEEN 3 AND 99),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  parent_name text NOT NULL DEFAULT '' CHECK (length(parent_name) <= 120),
  parent_email text NOT NULL DEFAULT '' CHECK (length(parent_email) <= 254),
  parent_phone text NOT NULL DEFAULT '' CHECK (length(parent_phone) <= 40),
  source text NOT NULL CHECK (source IN ('rehab', 'school', 'association', 'fair', 'social', 'word_of_mouth', 'other')),
  origin_organization_id uuid,
  origin_contact_id uuid,
  own_chair boolean,
  needs_transport boolean,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  consent boolean NOT NULL DEFAULT false,
  stage text NOT NULL DEFAULT 'first_contact' CHECK (stage IN ('first_contact', 'trial_planned', 'trial_done', 'follow_up', 'registered', 'not_now')),
  trial_event_id uuid,
  profile_id uuid,
  last_contact_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  -- A minor is reached through his parent.
  CHECK (NOT minor OR length(trim(parent_name)) >= 2),
  FOREIGN KEY (origin_organization_id, organization_id) REFERENCES contact_organization(id, organization_id) ON DELETE SET NULL (origin_organization_id),
  FOREIGN KEY (origin_contact_id, organization_id) REFERENCES contact(id, organization_id) ON DELETE SET NULL (origin_contact_id),
  FOREIGN KEY (trial_event_id, organization_id) REFERENCES calendar_event(id, organization_id) ON DELETE SET NULL (trial_event_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS prospect_org ON prospect(organization_id, stage);
CREATE TABLE IF NOT EXISTS prospect_stage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospect(id) ON DELETE CASCADE,
  stage text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  by_user text REFERENCES "user"(id)
);
CREATE INDEX IF NOT EXISTS prospect_stage_prospect ON prospect_stage(prospect_id, at);
-- Stays known after the deletion of the prospect: where the club's players come from (no name).
ALTER TABLE club_person ADD COLUMN IF NOT EXISTS recruitment_source text CHECK (recruitment_source IS NULL OR recruitment_source IN ('rehab', 'school', 'association', 'fair', 'social', 'word_of_mouth', 'other'));
ALTER TABLE club_person ADD COLUMN IF NOT EXISTS recruitment_organization_id uuid;
-- A chair of the club booked for a prospect's trial session.
ALTER TABLE chair_booking ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES prospect(id) ON DELETE CASCADE;
ALTER TABLE chair_booking ALTER COLUMN profile_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE chair_booking ADD CONSTRAINT chair_booking_who CHECK (profile_id IS NOT NULL OR prospect_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Counted per partner even after a deletion: the anonymous tally of a prospect.
CREATE TABLE IF NOT EXISTS recruitment_tally (
  organization_id uuid NOT NULL REFERENCES organization(id),
  source text NOT NULL,
  origin_organization_id uuid,
  created_on date NOT NULL,
  reached_trial boolean NOT NULL DEFAULT false,
  registered boolean NOT NULL DEFAULT false,
  prospect_id uuid UNIQUE
);
CREATE INDEX IF NOT EXISTS recruitment_tally_org ON recruitment_tally(organization_id, created_on);
