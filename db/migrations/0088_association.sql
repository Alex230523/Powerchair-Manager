-- 17: the ASBL's life. The register of members and the general assembly
-- (and the board), as automated as possible. Additive. Every rule comes
-- from the club's statutes: the defaults are only a starting point.

-- 5. The statutes' rules, set in Réglages › Club.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS assembly_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 1. A person's associative status, apart from the sport registration.
CREATE TABLE IF NOT EXISTS association_member (
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'none' CHECK (status IN ('effective', 'adherent', 'none')),
  admitted_on date,
  left_on date,
  board_role text CHECK (board_role IS NULL OR board_role IN ('president', 'vice_president', 'secretary', 'treasurer', 'director')),
  board_from date,
  board_until date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, profile_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);

-- 2. The register: one dated line per admission, exit or change, never
--    modified (a correction is a new line with its reason).
CREATE TABLE IF NOT EXISTS member_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('admission', 'resignation', 'exclusion', 'status', 'board_start', 'board_end', 'correction')),
  status_after text NOT NULL CHECK (status_after IN ('effective', 'adherent', 'none')),
  board_role text,
  decision_body text CHECK (decision_body IS NULL OR decision_body IN ('assembly', 'board')),
  decision_on date,
  meeting_id uuid,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  corrects_id uuid REFERENCES member_register(id),
  recorded_by text NOT NULL REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  CHECK (event <> 'correction' OR (corrects_id IS NOT NULL AND length(trim(reason)) >= 3))
);
CREATE INDEX IF NOT EXISTS member_register_org ON member_register(organization_id, recorded_at);
CREATE OR REPLACE FUNCTION member_register_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MEMBER_REGISTER_FROZEN' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS member_register_frozen ON member_register;
CREATE TRIGGER member_register_frozen BEFORE UPDATE OR DELETE ON member_register FOR EACH ROW EXECUTE FUNCTION member_register_frozen();

-- 6 to 12. Meetings: the general assembly and the board.
CREATE TABLE IF NOT EXISTS association_meeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('assembly', 'board')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  starts_at timestamptz NOT NULL,
  place text NOT NULL DEFAULT '' CHECK (length(place) <= 300),
  fiscal_year_start date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'held', 'closed', 'cancelled')),
  second_of uuid REFERENCES association_meeting(id),
  invite_sent_at timestamptz,
  reminder_sent_at timestamptz,
  quorum_reached boolean,
  minutes text NOT NULL DEFAULT '' CHECK (length(minutes) <= 40000),
  signed_president_name text,
  signed_president_at timestamptz,
  signed_secretary_name text,
  signed_secretary_at timestamptz,
  document_id uuid,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS association_meeting_org ON association_meeting(organization_id, starts_at);
DO $$ BEGIN
  ALTER TABLE member_register ADD CONSTRAINT member_register_meeting FOREIGN KEY (meeting_id) REFERENCES association_meeting(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. The agenda, point by point, with its votes.
CREATE TABLE IF NOT EXISTS meeting_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES association_meeting(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('accounts', 'budget', 'discharge', 'mandate', 'admission', 'exit', 'free')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 300),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 4000),
  majority text NOT NULL DEFAULT 'simple' CHECK (majority IN ('simple', 'absolute', 'two_thirds', 'four_fifths')),
  profile_id uuid REFERENCES club_person(id),
  board_role text,
  votes_for integer CHECK (votes_for IS NULL OR votes_for >= 0),
  votes_against integer CHECK (votes_against IS NULL OR votes_against >= 0),
  votes_abstain integer CHECK (votes_abstain IS NULL OR votes_abstain >= 0),
  result text CHECK (result IS NULL OR result IN ('adopted', 'rejected'))
);
CREATE INDEX IF NOT EXISTS meeting_item_meeting ON meeting_item(meeting_id, position);

-- 8 and 9. Answers, presence and proxies.
CREATE TABLE IF NOT EXISTS meeting_attendee (
  meeting_id uuid NOT NULL REFERENCES association_meeting(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES club_person(id),
  answer text NOT NULL DEFAULT 'none' CHECK (answer IN ('none', 'present', 'absent')),
  present boolean NOT NULL DEFAULT false,
  PRIMARY KEY (meeting_id, profile_id)
);
CREATE TABLE IF NOT EXISTS meeting_proxy (
  meeting_id uuid NOT NULL REFERENCES association_meeting(id) ON DELETE CASCADE,
  giver_id uuid NOT NULL REFERENCES club_person(id),
  holder_id uuid NOT NULL REFERENCES club_person(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, giver_id),
  CHECK (giver_id <> holder_id)
);
