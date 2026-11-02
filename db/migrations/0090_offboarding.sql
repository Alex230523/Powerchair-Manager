-- « Fin de coach » (offboarding): the departure's to-do, worked out from what
-- the application knows of the coach; the counterpart of the welcome
-- journey. Additive. At the end date his rights end whatever is left open.

-- 7. The steps a club keeps in its departure (the others are left out).
ALTER TABLE organization ADD COLUMN IF NOT EXISTS offboarding_skip text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS offboarding_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  user_id text REFERENCES "user"(id),
  ends_on date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('stopped', 'moved', 'unknown')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  survey jsonb,
  started_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS offboarding_run_once ON offboarding_run(organization_id, profile_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS offboarding_step (
  run_id uuid NOT NULL REFERENCES offboarding_run(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 80),
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('replace', 'tasks', 'duties', 'keys', 'exercises', 'rights', 'notify', 'thanks', 'survey', 'close')),
  ref uuid,
  label text NOT NULL DEFAULT '',
  blocking boolean NOT NULL DEFAULT false,
  due_on date NOT NULL,
  task_id uuid REFERENCES task(id) ON DELETE SET NULL,
  done_at timestamptz,
  done_how text CHECK (done_how IS NULL OR done_how IN ('auto', 'done', 'skipped')),
  skip_reason text NOT NULL DEFAULT '' CHECK (length(skip_reason) <= 300),
  PRIMARY KEY (run_id, key)
);
