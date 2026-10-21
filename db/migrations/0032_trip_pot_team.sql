-- Wave 15 (1.C): a trip or a fundraising pot may belong to one team; NULL means the whole club.
-- The composite keys keep the team inside the same organisation, like the wave 12 tables.
ALTER TABLE trip ADD COLUMN team_id uuid;
ALTER TABLE trip ADD FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id);
CREATE INDEX trip_team ON trip(organization_id,team_id) WHERE team_id IS NOT NULL;
ALTER TABLE fundraising_pot ADD COLUMN team_id uuid;
ALTER TABLE fundraising_pot ADD FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id);
CREATE INDEX fundraising_pot_team ON fundraising_pot(organization_id,team_id) WHERE team_id IS NOT NULL;
