-- Security (06/11/2026, Broken Access Control): a club no longer sets its federation by itself. It asks;
-- the federation accepts or refuses. Before, any club president could attach the club to any federation
-- and read that federation's transfer market, circulars, trainings and clubs' teams. Additive, idempotent.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS federation_request_id uuid REFERENCES organization(id);
ALTER TABLE organization ADD COLUMN IF NOT EXISTS federation_requested_at timestamptz;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS federation_requested_by text REFERENCES "user"(id);
CREATE INDEX IF NOT EXISTS organization_federation_request ON organization(federation_request_id) WHERE federation_request_id IS NOT NULL;
