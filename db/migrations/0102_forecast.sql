-- H4: the 12-month cash forecast. Built from what the application already
-- knows; only the alert threshold and the simulation lines are stored, and
-- those lines never reach the ledger. Additive and idempotent.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS forecast_threshold_cents integer NOT NULL DEFAULT 0 CHECK (forecast_threshold_cents BETWEEN -100000000 AND 100000000);
CREATE TABLE IF NOT EXISTS forecast_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 160),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  probable boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forecast_line_org ON forecast_line(organization_id, month);
