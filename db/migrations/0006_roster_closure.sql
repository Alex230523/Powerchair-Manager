-- Dates retain historical membership; closure immediately removes coach-derived access.
ALTER TABLE team_membership ADD COLUMN closed_at timestamptz;
