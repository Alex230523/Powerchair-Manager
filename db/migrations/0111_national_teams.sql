-- 6: national teams of a federation. Its players come from the licensed
-- players of its clubs (sporting data only); each status change tells the
-- player (or the parents), the club's president and coaches; the player
-- answers available or not; care instructions are shared only with a
-- separate, revocable consent, for a given period. Gatherings, an
-- international tournament (a national team or a foreign team in free text
-- as participants), line-ups and statistics, and the Hall of fame.

-- A participant of a tournament that is not a club of the app: a national
-- team, or a foreign team typed in free text. It has no member and no role.
ALTER TABLE organization DROP CONSTRAINT IF EXISTS organization_kind_check;
ALTER TABLE organization ADD CONSTRAINT organization_kind_check CHECK (kind IN ('club', 'federation', 'guest'));

CREATE TABLE IF NOT EXISTS national_team (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 federation_id uuid NOT NULL REFERENCES organization(id),
 organization_id uuid NOT NULL UNIQUE REFERENCES organization(id),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
 category text NOT NULL CHECK (category IN ('senior', 'u23', 'u18', 'women', 'other')),
 season text NOT NULL CHECK (season ~ '^[0-9]{4}-[0-9]{2}$'),
 color text NOT NULL DEFAULT 'c1' CHECK (color IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8')),
 -- The rule of the competition: at most this many PF2 among the selected (none: no limit).
 max_pf2 integer CHECK (max_pf2 IS NULL OR max_pf2 BETWEEN 0 AND 20),
 archived boolean NOT NULL DEFAULT false,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, federation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS national_team_name ON national_team(federation_id, lower(trim(name)), season) WHERE NOT archived;

-- The staff: a coach of a club of the federation (with his trainings) or an
-- account of the federation.
CREATE TABLE IF NOT EXISTS national_team_staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL REFERENCES national_team(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('head_coach', 'assistant', 'physio', 'mechanic', 'companion')),
 user_id text REFERENCES "user"(id),
 profile_id uuid REFERENCES club_person(id),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (user_id IS NOT NULL OR profile_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS national_selection (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL REFERENCES national_team(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL,
 club_id uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('preselected', 'selected', 'reserve', 'withdrawn')),
 availability text NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown', 'available', 'unavailable')),
 availability_note text NOT NULL DEFAULT '' CHECK (length(availability_note) <= 500),
 answered_by text REFERENCES "user"(id),
 answered_at timestamptz,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 UNIQUE (team_id, profile_id),
 FOREIGN KEY (profile_id, club_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS national_selection_profile ON national_selection(profile_id);

-- Care instructions shared with the national staff: explicit, separate,
-- revocable, for a period only.
CREATE TABLE IF NOT EXISTS national_care_consent (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 selection_id uuid NOT NULL REFERENCES national_selection(id) ON DELETE CASCADE,
 granted_by text NOT NULL REFERENCES "user"(id),
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS national_gathering (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL REFERENCES national_team(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('camp', 'training', 'match')),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 place text NOT NULL DEFAULT '' CHECK (length(place) <= 200),
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_at >= starts_at)
);
CREATE TABLE IF NOT EXISTS national_gathering_answer (
 gathering_id uuid NOT NULL REFERENCES national_gathering(id) ON DELETE CASCADE,
 selection_id uuid NOT NULL REFERENCES national_selection(id) ON DELETE CASCADE,
 response text NOT NULL DEFAULT 'none' CHECK (response IN ('none', 'present', 'absent')),
 responded_by text REFERENCES "user"(id),
 responded_at timestamptz,
 PRIMARY KEY (gathering_id, selection_id)
);

-- The line-up and figures of the national team in a tournament match.
CREATE TABLE IF NOT EXISTS national_match_player (
 match_id uuid NOT NULL REFERENCES tournament_match(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES national_team(id) ON DELETE CASCADE,
 selection_id uuid NOT NULL REFERENCES national_selection(id) ON DELETE CASCADE,
 starter boolean NOT NULL DEFAULT false,
 goals integer NOT NULL DEFAULT 0 CHECK (goals BETWEEN 0 AND 50),
 assists integer NOT NULL DEFAULT 0 CHECK (assists BETWEEN 0 AND 50),
 PRIMARY KEY (match_id, selection_id)
);

-- An international result in the federation's Hall of fame, cited on the players' sheets.
ALTER TABLE award ADD COLUMN IF NOT EXISTS national_team_id uuid REFERENCES national_team(id);
