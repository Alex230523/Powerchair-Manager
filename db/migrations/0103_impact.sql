-- H13: the impact report for grants. Every figure is computed from the
-- data; only the settings (hours per task type, hourly rate), the signed
-- adjustments with their note, and the report filed with a grant are kept.
-- Additive and idempotent.
CREATE TABLE IF NOT EXISTS impact_setting (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  task_hours jsonb NOT NULL DEFAULT '{}',
  trip_hours numeric(4, 1) NOT NULL DEFAULT 4 CHECK (trip_hours BETWEEN 0 AND 48),
  hourly_rate_cents integer CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents BETWEEN 0 AND 100000),
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- An adjustment never replaces a figure: it is added to it, with its reason, for one period.
CREATE TABLE IF NOT EXISTS impact_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  period_from date NOT NULL,
  period_to date NOT NULL CHECK (period_to >= period_from),
  indicator text NOT NULL CHECK (indicator IN ('volunteerHours', 'sportHours', 'sessions', 'beneficiaries', 'kilometres')),
  delta numeric(10, 1) NOT NULL,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 3 AND 500),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS impact_adjustment_org ON impact_adjustment(organization_id, period_from);
-- The report filed with a grant's justification (its PDF as it was sent).
CREATE TABLE IF NOT EXISTS grant_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  grant_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'impact' CHECK (kind IN ('impact')),
  filename text NOT NULL CHECK (length(trim(filename)) BETWEEN 1 AND 200),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  period_from date NOT NULL,
  period_to date NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (grant_id, organization_id) REFERENCES grant_application(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS grant_attachment_grant ON grant_attachment(grant_id);
