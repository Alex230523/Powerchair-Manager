-- 31: « Mon suivi ». The coach's objectives for a player (1 to 5 per period),
-- the dated feedback the player and his parents read and react to, and the
-- coach's private notes, kept in a table of their own so that no reading of
-- the player's follow-up can ever reach them.
CREATE TABLE IF NOT EXISTS player_goal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 profile_id uuid NOT NULL,
 period text NOT NULL CHECK (length(trim(period)) BETWEEN 1 AND 40),
 category text NOT NULL CHECK (category IN ('technique', 'driving', 'tactics', 'behaviour', 'other')),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 200),
 detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 1000),
 status text NOT NULL DEFAULT 'to_work' CHECK (status IN ('to_work', 'progressing', 'acquired')),
 -- A player may propose one; his coach takes it or declines it.
 state text NOT NULL DEFAULT 'active' CHECK (state IN ('proposed', 'active', 'declined')),
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 acquired_at timestamptz,
 version integer NOT NULL DEFAULT 1,
 FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS player_goal_profile ON player_goal(organization_id, profile_id, period);

CREATE TABLE IF NOT EXISTS player_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 profile_id uuid NOT NULL,
 author_id text NOT NULL REFERENCES "user"(id),
 body text NOT NULL CHECK (length(trim(body)) BETWEEN 2 AND 1000),
 event_id uuid,
 match_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 seen_at timestamptz,
 reaction text NOT NULL DEFAULT '' CHECK (length(reaction) <= 280),
 reacted_at timestamptz,
 reacted_by text REFERENCES "user"(id),
 FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
 FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id),
 FOREIGN KEY (match_id, organization_id) REFERENCES match(id, organization_id)
);
CREATE INDEX IF NOT EXISTS player_feedback_profile ON player_feedback(organization_id, profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_coach_note (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 profile_id uuid NOT NULL,
 author_id text NOT NULL REFERENCES "user"(id),
 body text NOT NULL CHECK (length(trim(body)) BETWEEN 2 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS player_coach_note_profile ON player_coach_note(organization_id, profile_id, created_at DESC);
