-- 06/11/2026 (international, step 4): the competition as the organiser's
-- object, seen by both clubs. A tournament carries its layer (tier); a club
-- names the team it plays with; every match of the tournament is mirrored
-- in the two clubs' own calendars (one match row each, linked), with the
-- result once validated.
ALTER TABLE tournament ADD COLUMN IF NOT EXISTS tier integer NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 9);
ALTER TABLE tournament_club ADD COLUMN IF NOT EXISTS team_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournament_club_team_fk') THEN
    ALTER TABLE tournament_club ADD CONSTRAINT tournament_club_team_fk FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id);
  END IF;
END $$;
ALTER TABLE match ADD COLUMN IF NOT EXISTS tournament_match_id uuid REFERENCES tournament_match(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS match_tournament_mirror ON match(tournament_match_id, organization_id) WHERE tournament_match_id IS NOT NULL;
