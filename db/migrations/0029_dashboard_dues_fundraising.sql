-- Wave 10: presence thresholds for the dashboard, fundraising with the
-- players, and the amount of the dues shown on registration forms.

-- How many players and coaches must have answered "present" for a session to
-- be green (ok), yellow (warn) or red (below warn). Per event family.
ALTER TABLE organization ADD COLUMN presence_rules jsonb NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof(presence_rules) = 'object');

-- A pot the players take part in: each one sees it, sees who collected what,
-- and notes what they collected themselves.
ALTER TABLE fundraising_pot ADD COLUMN players_join boolean NOT NULL DEFAULT false;
ALTER TABLE fundraising_movement
  ADD COLUMN profile_id uuid REFERENCES club_person(id),
  ADD COLUMN self_reported boolean NOT NULL DEFAULT false;
CREATE INDEX fundraising_movement_collector ON fundraising_movement(profile_id) WHERE profile_id IS NOT NULL;
