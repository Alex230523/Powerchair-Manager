-- B5: incidents (falls, collisions, injuries, malaises, damage) and their
-- insurance declaration. The facts and the health data are kept apart: the
-- health part is sealed and read only with the sensitive rights.

-- 1. The club's insurer and how many days it gives to declare.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS insurer_name text NOT NULL DEFAULT '';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS insurer_policy text NOT NULL DEFAULT '';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS insurer_email text NOT NULL DEFAULT '';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS incident_declaration_days integer NOT NULL DEFAULT 8;
DO $$ BEGIN
  ALTER TABLE organization ADD CONSTRAINT organization_insurer_check CHECK (length(insurer_name) <= 120 AND length(insurer_policy) <= 80 AND length(insurer_email) <= 200 AND incident_declaration_days BETWEEN 1 AND 90);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The incident: the facts.
CREATE TABLE IF NOT EXISTS incident (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  context text NOT NULL CHECK (context IN ('training', 'match', 'trip', 'other')),
  event_id uuid,
  kind text NOT NULL CHECK (kind IN ('fall', 'collision', 'injury', 'malaise', 'chair_damage', 'equipment_damage')),
  place text NOT NULL DEFAULT '' CHECK (length(place) <= 200),
  circumstances text NOT NULL CHECK (length(trim(circumstances)) BETWEEN 5 AND 4000),
  witnesses text NOT NULL DEFAULT '' CHECK (length(witnesses) <= 1000),
  chair_id uuid,
  intervention_id uuid REFERENCES chair_intervention(id),
  -- Injuries, first aid, care: sealed, for people.sensitive / documents.sensitive only.
  health_ciphertext text,
  insurance_status text NOT NULL DEFAULT 'to_declare' CHECK (insurance_status IN ('to_declare', 'sent', 'accepted', 'refused', 'reimbursed', 'not_needed')),
  insurance_deadline date NOT NULL,
  claim_reference text NOT NULL DEFAULT '' CHECK (length(claim_reference) <= 80),
  sent_on date,
  claimed_cents integer CHECK (claimed_cents IS NULL OR claimed_cents BETWEEN 0 AND 100000000),
  reimbursed_cents integer CHECK (reimbursed_cents IS NULL OR reimbursed_cents BETWEEN 0 AND 100000000),
  reminded_on date,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id),
  FOREIGN KEY (chair_id, organization_id) REFERENCES equipment_chair(id, organization_id)
);
CREATE INDEX IF NOT EXISTS incident_org ON incident(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS incident_to_declare ON incident(insurance_deadline) WHERE insurance_status = 'to_declare';

-- 3. The people concerned.
CREATE TABLE IF NOT EXISTS incident_person (
  incident_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  PRIMARY KEY (incident_id, profile_id),
  FOREIGN KEY (incident_id, organization_id) REFERENCES incident(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS incident_person_profile ON incident_person(profile_id);

-- 4. Photos (treated as health data) and the insurance papers.
CREATE TABLE IF NOT EXISTS incident_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('photo', 'piece')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) <= 2097152),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (incident_id, organization_id) REFERENCES incident(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS incident_file_incident ON incident_file(incident_id);

-- 5. Opening an incident's health part, or the care instructions shown to the reporter, is logged.
ALTER TABLE sensitive_access_log DROP CONSTRAINT IF EXISTS sensitive_access_log_kind_check;
ALTER TABLE sensitive_access_log ADD CONSTRAINT sensitive_access_log_kind_check
  CHECK (kind IN ('player_health', 'registration_confidential', 'sensitive_document', 'offline_book', 'trip_care', 'incident_health', 'incident_care'));
