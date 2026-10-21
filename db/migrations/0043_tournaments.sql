-- Tournaments (21 October 2026): the federation calendar becomes "Tournois".
-- A federation or club president creates a tournament, invites clubs, plans
-- match days (date, venue, host club, notes) and the matches of each day.
-- The first allowed person to enter a result reports it; the organiser or
-- the designated referee corrects it if needed and validates it. A finished
-- tournament turns its podium into trophies, each with an optional photo.

CREATE TABLE tournament (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  year int NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  format text NOT NULL CHECK (format IN ('league','groups_knockout','knockout','custom')),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','finished')),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  version int NOT NULL DEFAULT 1
);
CREATE INDEX tournament_year ON tournament(year);
CREATE INDEX tournament_owner ON tournament(organization_id);

-- Participating clubs: invited, then accepted or declined by the club's president.
CREATE TABLE tournament_club (
  tournament_id uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id),
  team_name text NOT NULL DEFAULT '' CHECK (length(team_name) <= 120),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined')),
  group_label text NOT NULL DEFAULT '' CHECK (length(group_label) <= 20),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by text REFERENCES "user"(id),
  PRIMARY KEY (tournament_id, organization_id)
);
CREATE INDEX tournament_club_org ON tournament_club(organization_id);

CREATE TABLE tournament_day (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  day date NOT NULL,
  venue text NOT NULL DEFAULT '' CHECK (length(venue) <= 200),
  host_organization_id uuid REFERENCES organization(id),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tournament_id)
);
CREATE INDEX tournament_day_date ON tournament_day(day);

CREATE TABLE tournament_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  day_id uuid NOT NULL,
  kickoff time NOT NULL,
  stage text NOT NULL CHECK (stage IN ('league','group','round16','quarter','semi','third','final','other')),
  group_label text NOT NULL DEFAULT '' CHECK (length(group_label) <= 20),
  home_organization_id uuid NOT NULL,
  away_organization_id uuid NOT NULL,
  referee_user_id text REFERENCES "user"(id),
  home_score int CHECK (home_score BETWEEN 0 AND 99),
  away_score int CHECK (away_score BETWEEN 0 AND 99),
  home_shootout int CHECK (home_shootout BETWEEN 0 AND 99),
  away_shootout int CHECK (away_shootout BETWEEN 0 AND 99),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','reported','validated','cancelled')),
  reported_by text REFERENCES "user"(id),
  reported_at timestamptz,
  validated_by text REFERENCES "user"(id),
  validated_at timestamptz,
  version int NOT NULL DEFAULT 1,
  CHECK (home_organization_id <> away_organization_id),
  CHECK ((home_score IS NULL) = (away_score IS NULL)),
  CHECK (status IN ('scheduled','cancelled') OR home_score IS NOT NULL),
  FOREIGN KEY (day_id, tournament_id) REFERENCES tournament_day(id, tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (tournament_id, home_organization_id) REFERENCES tournament_club(tournament_id, organization_id),
  FOREIGN KEY (tournament_id, away_organization_id) REFERENCES tournament_club(tournament_id, organization_id)
);
CREATE INDEX tournament_match_tournament ON tournament_match(tournament_id);

-- Player figures of a match: each line belongs to one of the two clubs.
CREATE TABLE tournament_stat (
  match_id uuid NOT NULL REFERENCES tournament_match(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  goals int NOT NULL DEFAULT 0 CHECK (goals BETWEEN 0 AND 50),
  assists int NOT NULL DEFAULT 0 CHECK (assists BETWEEN 0 AND 50),
  yellow_cards int NOT NULL DEFAULT 0 CHECK (yellow_cards BETWEEN 0 AND 2),
  red_card boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, profile_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);

CREATE TABLE tournament_trophy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id),
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 3),
  photo bytea,
  photo_type text CHECK (photo_type IN ('image/png','image/jpeg','image/webp')),
  photo_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, rank),
  CHECK ((photo IS NULL) = (photo_type IS NULL))
);
CREATE INDEX tournament_trophy_org ON tournament_trophy(organization_id);
