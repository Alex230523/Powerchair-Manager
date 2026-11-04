-- 25, 36 to 39: one refereeing circuit. A designation now also targets a
-- tournament match (with acceptance, availability and reminders); levels
-- and trainings without expiry; expense claims; a fuller referee report
-- with the coaches' review. Additive.

CREATE TABLE IF NOT EXISTS tournament_referee_assignment (
  tournament_match_id uuid NOT NULL REFERENCES tournament_match(id) ON DELETE CASCADE,
  federation_id uuid NOT NULL REFERENCES organization(id),
  referee_id text NOT NULL REFERENCES "user"(id),
  role text NOT NULL DEFAULT 'main' CHECK (role IN ('main', 'assistant', 'table')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'declined', 'withdrawn')),
  assigned_by text NOT NULL REFERENCES "user"(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  reminded_at timestamptz,
  PRIMARY KEY (tournament_match_id, referee_id)
);
CREATE INDEX IF NOT EXISTS tournament_referee_assignment_referee ON tournament_referee_assignment(referee_id, status);
ALTER TABLE referee_assignment ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

-- The tournaments' single « arbitre » field becomes an accepted designation.
INSERT INTO tournament_referee_assignment(tournament_match_id, federation_id, referee_id, role, status, assigned_by, answered_at)
SELECT m.id, f.id, m.referee_user_id, 'main', 'accepted', m.referee_user_id, now()
  FROM tournament_match m JOIN tournament t ON t.id = m.tournament_id JOIN organization o ON o.id = t.organization_id
  JOIN organization f ON f.id = CASE WHEN o.kind = 'federation' THEN o.id ELSE o.federation_id END
 WHERE m.referee_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- One list of designations, whatever the match.
CREATE OR REPLACE VIEW designation AS
  SELECT 'match'::text AS kind, match_id AS target_id, federation_id, referee_id, role, status, assigned_by, assigned_at, answered_at, reminded_at FROM referee_assignment
  UNION ALL
  SELECT 'tournament'::text, tournament_match_id, federation_id, referee_id, role, status, assigned_by, assigned_at, answered_at, reminded_at FROM tournament_referee_assignment;

-- 38: levels (named by the federation) and trainings, without expiry.
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS referee_levels text[] NOT NULL DEFAULT ARRAY['Débutant', 'Régional', 'National', 'International'],
  ADD COLUMN IF NOT EXISTS referee_flat_cents integer NOT NULL DEFAULT 0 CHECK (referee_flat_cents BETWEEN 0 AND 100000),
  ADD COLUMN IF NOT EXISTS referee_km_rate_cents integer NOT NULL DEFAULT 0 CHECK (referee_km_rate_cents BETWEEN 0 AND 500);
CREATE TABLE IF NOT EXISTS referee_profile (
  federation_id uuid NOT NULL REFERENCES organization(id),
  user_id text NOT NULL REFERENCES "user"(id),
  level integer NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 19),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (federation_id, user_id)
);
CREATE TABLE IF NOT EXISTS referee_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  user_id text NOT NULL REFERENCES "user"(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  done_on date NOT NULL,
  proof_filename text,
  proof_type text CHECK (proof_type IS NULL OR proof_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  proof bytea CHECK (proof IS NULL OR octet_length(proof) BETWEEN 1 AND 5242880),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'refused')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 37: expense claims after a match refereed.
CREATE TABLE IF NOT EXISTS referee_expense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  referee_id text NOT NULL REFERENCES "user"(id),
  match_id uuid REFERENCES match(id),
  tournament_match_id uuid REFERENCES tournament_match(id) ON DELETE SET NULL,
  km numeric(6, 1) NOT NULL DEFAULT 0 CHECK (km BETWEEN 0 AND 5000),
  flat_cents integer NOT NULL DEFAULT 0,
  km_rate_cents integer NOT NULL DEFAULT 0,
  extra_cents integer NOT NULL DEFAULT 0 CHECK (extra_cents BETWEEN 0 AND 100000),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  proof_filename text,
  proof_type text CHECK (proof_type IS NULL OR proof_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  proof bytea CHECK (proof IS NULL OR octet_length(proof) BETWEEN 1 AND 5242880),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'refused', 'paid')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((match_id IS NULL) <> (tournament_match_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS referee_expense_once_match ON referee_expense(referee_id, match_id) WHERE match_id IS NOT NULL AND status <> 'refused';
CREATE UNIQUE INDEX IF NOT EXISTS referee_expense_once_tournament ON referee_expense(referee_id, tournament_match_id) WHERE tournament_match_id IS NOT NULL AND status <> 'refused';

-- 36: the report's goals and cards (player, minute), its reserves, and the coaches' review within 48 hours.
ALTER TABLE match_report
  ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS reserves text NOT NULL DEFAULT '',
  -- Confirmed by the club's coach, or 48 hours without a contest: the statistics take it then.
  ADD COLUMN IF NOT EXISTS validated_at timestamptz;
DO $$ BEGIN
  ALTER TABLE match_report ADD CONSTRAINT match_report_reserves_check CHECK (length(reserves) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS match_report_review (
  match_id uuid NOT NULL REFERENCES match_report(match_id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id),
  user_id text NOT NULL REFERENCES "user"(id),
  decision text NOT NULL CHECK (decision IN ('confirmed', 'contested')),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, organization_id)
);
