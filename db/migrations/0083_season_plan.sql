-- 16: « Préparer la saison suivante ». One plan per club and ending season:
-- the state of each step (to do, done, skipped), the choices made so far
-- (resumable later), the season it created; and the actions it scheduled
-- (dues issue, data check, « Nouvelle saison » email), each at its date,
-- cancellable until it runs, run once by the daily jobs.
CREATE TABLE IF NOT EXISTS season_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  from_season_id uuid NOT NULL,
  steps jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(steps) = 'object'),
  choices jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(choices) = 'object'),
  new_season_id uuid REFERENCES season(id),
  launched_at timestamptz,
  launched_by text REFERENCES "user"(id),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (organization_id, from_season_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (from_season_id, organization_id) REFERENCES season(id, organization_id)
);
CREATE TABLE IF NOT EXISTS season_plan_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dues_issue', 'season_check', 'newsletter')),
  run_on date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled', 'failed')),
  result jsonb NOT NULL DEFAULT '{}',
  error text NOT NULL DEFAULT '' CHECK (length(error) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  cancelled_by text REFERENCES "user"(id),
  UNIQUE (plan_id, kind),
  FOREIGN KEY (plan_id, organization_id) REFERENCES season_plan(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS season_plan_action_due ON season_plan_action(status, run_on);
