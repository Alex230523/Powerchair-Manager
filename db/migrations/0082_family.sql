-- 27 to 29: the parents.
-- 1. A family calendar feed: the events of all one's children, in every club.
ALTER TABLE calendar_feed ADD COLUMN IF NOT EXISTS family boolean NOT NULL DEFAULT false;

-- 2. Parental authorizations signed online. The club's texts are document
--    templates marked with their kind (one per language, versioned like the
--    others); the validity says whether one signature covers the season or
--    a single trip. A request is created when a minor joins a trip
--    (travel, tournament, camp), signed on the document of the minor.
ALTER TABLE document_template ADD COLUMN IF NOT EXISTS authorization_kind text;
DO $$ BEGIN
  ALTER TABLE document_template ADD CONSTRAINT document_template_authorization_kind_check
    CHECK (authorization_kind IS NULL OR authorization_kind IN ('travel', 'image', 'image_event', 'care', 'outing'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS authorization_setting (
  organization_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('travel', 'image', 'image_event', 'care', 'outing')),
  validity text NOT NULL CHECK (validity IN ('season', 'event')),
  on_trips boolean NOT NULL DEFAULT false,
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kind)
);
CREATE TABLE IF NOT EXISTS authorization_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('travel', 'image', 'image_event', 'care', 'outing')),
  profile_id uuid NOT NULL,
  season_id uuid NOT NULL,
  trip_id uuid REFERENCES trip(id) ON DELETE CASCADE,
  document_id uuid REFERENCES club_document(id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'signed', 'refused', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text REFERENCES "user"(id),
  reminded_at timestamptz,
  answered_at timestamptz,
  answered_by text REFERENCES "user"(id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS authorization_request_season ON authorization_request(profile_id, kind, season_id) WHERE trip_id IS NULL AND status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS authorization_request_trip ON authorization_request(profile_id, kind, trip_id) WHERE trip_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS authorization_request_open ON authorization_request(organization_id, status);

-- 3. Two homes: who receives the dues and the mutual insurance attestations
--    of a child (one guardian, the other, or shared by percentage), and who
--    paid a payment.
CREATE TABLE IF NOT EXISTS billing_split (
  organization_id uuid NOT NULL REFERENCES organization(id),
  subject_profile_id uuid NOT NULL,
  guardian_profile_id uuid NOT NULL,
  percent integer NOT NULL CHECK (percent BETWEEN 1 AND 100),
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_profile_id, guardian_profile_id),
  FOREIGN KEY (subject_profile_id, organization_id) REFERENCES club_person(id, organization_id),
  FOREIGN KEY (guardian_profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
ALTER TABLE finance_transaction ADD COLUMN IF NOT EXISTS payer_profile_id uuid REFERENCES club_person(id);

-- Each representative keeps his own postal address (two homes).
ALTER TABLE club_person ADD COLUMN IF NOT EXISTS postal_address text NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE club_person ADD CONSTRAINT club_person_postal_address_check CHECK (length(postal_address) <= 300);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
