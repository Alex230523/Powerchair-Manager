-- 34: the federation's discipline, fed by the validated referee reports
-- and the validated tournament results. Rules per federation and per
-- season, versioned (a change adds a version, an old season keeps its
-- own); the cards counted; sanctions proposed then decided; appeals;
-- fines owed by a club to its federation. Additive.

CREATE TABLE IF NOT EXISTS discipline_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  season text NOT NULL CHECK (season ~ '^[0-9]{4}-[0-9]{2}$'),
  version integer NOT NULL CHECK (version >= 1),
  yellow_threshold integer NOT NULL CHECK (yellow_threshold BETWEEN 1 AND 20),
  yellow_matches integer NOT NULL CHECK (yellow_matches BETWEEN 0 AND 20),
  red_matches integer NOT NULL CHECK (red_matches BETWEEN 0 AND 20),
  kinds text[] NOT NULL CHECK (kinds <@ ARRAY['league', 'cup', 'tournament', 'friendly']::text[] AND cardinality(kinds) >= 1),
  reset text NOT NULL CHECK (reset IN ('season', 'never')),
  yellow_fine_cents integer NOT NULL DEFAULT 0 CHECK (yellow_fine_cents BETWEEN 0 AND 1000000),
  red_fine_cents integer NOT NULL DEFAULT 0 CHECK (red_fine_cents BETWEEN 0 AND 1000000),
  appeal_days integer NOT NULL CHECK (appeal_days BETWEEN 0 AND 60),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (federation_id, season, version)
);

-- Each card of a validated report or result, once.
CREATE TABLE IF NOT EXISTS discipline_card (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  season text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('yellow', 'red')),
  competition text NOT NULL CHECK (competition IN ('league', 'cup', 'tournament', 'friendly')),
  match_id uuid REFERENCES match(id) ON DELETE CASCADE,
  tournament_match_id uuid REFERENCES tournament_match(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 1 CHECK (seq BETWEEN 1 AND 3),
  played_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  CHECK ((match_id IS NULL) <> (tournament_match_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS discipline_card_once ON discipline_card(profile_id, kind, seq, COALESCE(match_id, tournament_match_id));
CREATE INDEX IF NOT EXISTS discipline_card_player ON discipline_card(federation_id, profile_id, season);

CREATE TABLE IF NOT EXISTS discipline_sanction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  -- A player's or a coach's profile; none for a sanction of the club itself.
  profile_id uuid,
  target text NOT NULL CHECK (target IN ('player', 'coach', 'club')),
  cause text NOT NULL CHECK (cause IN ('yellows', 'red', 'manual')),
  card_id uuid REFERENCES discipline_card(id) ON DELETE SET NULL,
  season text NOT NULL,
  rule_id uuid REFERENCES discipline_rule(id),
  matches integer NOT NULL CHECK (matches BETWEEN 0 AND 99),
  kinds text[] NOT NULL,
  fine_cents integer NOT NULL DEFAULT 0 CHECK (fine_cents BETWEEN 0 AND 1000000),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 500),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'cancelled')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  appeal_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  CHECK ((target = 'club') = (profile_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS discipline_sanction_card ON discipline_sanction(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS discipline_sanction_fed ON discipline_sanction(federation_id, status);
CREATE INDEX IF NOT EXISTS discipline_sanction_player ON discipline_sanction(profile_id) WHERE profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS discipline_appeal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sanction_id uuid NOT NULL REFERENCES discipline_sanction(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  user_id text NOT NULL REFERENCES "user"(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 4000),
  file_name text,
  file_type text CHECK (file_type IS NULL OR file_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  file bytea CHECK (file IS NULL OR octet_length(file) BETWEEN 1 AND 5242880),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  decision text NOT NULL DEFAULT '' CHECK (length(decision) <= 1000),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discipline_appeal_one ON discipline_appeal(sanction_id);

-- 5: a fine is a sum the club owes its federation.
CREATE TABLE IF NOT EXISTS discipline_fine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sanction_id uuid NOT NULL REFERENCES discipline_sanction(id),
  federation_id uuid NOT NULL REFERENCES organization(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 1000000),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'cancelled')),
  paid_on date,
  marked_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discipline_fine_sanction ON discipline_fine(sanction_id);
CREATE INDEX IF NOT EXISTS discipline_fine_club ON discipline_fine(organization_id, status);
