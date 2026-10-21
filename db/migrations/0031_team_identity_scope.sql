-- Wave 12: team identity (colour, responsible person) and money by team.

-- A colour from a fixed palette (variables in globals.css) and an optional responsible person.
ALTER TABLE team ADD COLUMN color text CHECK(color IN ('blue','teal','green','amber','coral','plum','slate','sand'));
ALTER TABLE team ADD COLUMN staff_contact_id uuid;
ALTER TABLE team ADD FOREIGN KEY(staff_contact_id,organization_id) REFERENCES club_person(id,organization_id);

-- Money by team: NULL means the whole club. The same organisation is checked by the services.
ALTER TABLE finance_transaction ADD COLUMN team_id uuid;
ALTER TABLE finance_transaction ADD FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id);
CREATE INDEX finance_transaction_team ON finance_transaction(organization_id,team_id) WHERE team_id IS NOT NULL;
ALTER TABLE dues_plan ADD COLUMN team_id uuid;
ALTER TABLE dues_plan ADD FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id);
-- A budget line is per season, direction, category and team (whole club when NULL):
-- the key uses a generated column because NULL cannot be part of a primary key.
ALTER TABLE finance_budget ADD COLUMN team_id uuid;
ALTER TABLE finance_budget ADD FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id);
ALTER TABLE finance_budget ADD COLUMN team_key uuid GENERATED ALWAYS AS (COALESCE(team_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED;
ALTER TABLE finance_budget DROP CONSTRAINT finance_budget_pkey;
ALTER TABLE finance_budget ADD PRIMARY KEY(organization_id,season,direction,category,team_key);
