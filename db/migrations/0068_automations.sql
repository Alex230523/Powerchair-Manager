-- B7: the catalogue of automations (module 17): each club's settings per
-- rule, a global stop, and the journal with its idempotency key.
CREATE TABLE IF NOT EXISTS automation_rule (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (length(rule) BETWEEN 2 AND 60),
  enabled boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  delay_days integer CHECK (delay_days IS NULL OR delay_days BETWEEN 0 AND 365),
  recipients text NOT NULL DEFAULT 'default' CHECK (recipients IN ('default', 'person', 'president', 'responsible')),
  actions text[] NOT NULL DEFAULT '{notify,email}' CHECK (actions <@ ARRAY['notify', 'email', 'task']),
  messages jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(messages) = 'object'),
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, rule)
);
ALTER TABLE organization ADD COLUMN IF NOT EXISTS automations_stopped boolean NOT NULL DEFAULT false;

-- One line per thing done (or skipped, or failed) for whom; the key
-- (rule, entity, due date, recipient) is unique: a rule never sends twice.
CREATE TABLE IF NOT EXISTS automation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  rule text NOT NULL,
  idem_key text NOT NULL CHECK (length(idem_key) <= 300),
  entity_id text NOT NULL,
  about text NOT NULL DEFAULT '' CHECK (length(about) <= 200),
  recipient_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  recipient_label text NOT NULL DEFAULT '' CHECK (length(recipient_label) <= 160),
  result text NOT NULL CHECK (result IN ('sent', 'task', 'error', 'done')),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idem_key)
);
CREATE INDEX IF NOT EXISTS automation_run_recent ON automation_run(organization_id, created_at DESC);

-- The automations' messages, a resource of their own for the mail queue.
ALTER TABLE mail_job DROP CONSTRAINT IF EXISTS mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK (resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license','newsletter','event_mail','funding','digest','automation'));
