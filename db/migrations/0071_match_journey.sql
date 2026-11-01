-- A5: one match sheet, before / match day / after. The bricks exist; this
-- adds the line-up's publication, the result's validation and the events
-- of the day (goals, cards, substitutions), typed live, even offline.

ALTER TABLE match ADD COLUMN IF NOT EXISTS lineup_published_at timestamptz;
ALTER TABLE match ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE match ADD COLUMN IF NOT EXISTS validated_by text REFERENCES "user"(id);

CREATE TABLE IF NOT EXISTS match_live_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  match_id uuid NOT NULL,
  -- Given by the phone: an event sent twice (offline, then again) is written once.
  client_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('goal', 'goal_against', 'yellow', 'red', 'sub_in', 'sub_out')),
  profile_id uuid,
  minute integer CHECK (minute BETWEEN 0 AND 200),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  FOREIGN KEY (match_id, organization_id) REFERENCES match(id, organization_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  CHECK (kind = 'goal_against' OR profile_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS match_live_event_match ON match_live_event(match_id, created_at);
