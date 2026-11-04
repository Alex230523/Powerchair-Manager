-- 2: the to-do grows (A1 extended, not rebuilt).
-- 1. Several people in charge. task_assignee holds them (a club's profile or
--    a federation's account); the task's responsible_id / responsible_user_id
--    stay as « the first one » for the modules that still write them, and a
--    trigger keeps their person among the assignees. Existing tasks keep
--    their person. A task is done when one person ticks it (« any », the
--    default) or when each one ticked his part (« each »).
CREATE TABLE IF NOT EXISTS task_assignee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  profile_id uuid,
  user_id text REFERENCES "user"(id),
  done_on date,
  done_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((profile_id IS NULL) <> (user_id IS NULL)),
  FOREIGN KEY (task_id, organization_id) REFERENCES task(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS task_assignee_profile ON task_assignee(task_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS task_assignee_user ON task_assignee(task_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS task_assignee_of_profile ON task_assignee(organization_id, profile_id);
CREATE INDEX IF NOT EXISTS task_assignee_of_user ON task_assignee(organization_id, user_id);

INSERT INTO task_assignee(task_id, organization_id, profile_id, done_on)
SELECT t.id, t.organization_id, t.responsible_id, CASE WHEN t.status = 'done' THEN t.done_on END FROM task t
 WHERE t.responsible_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO task_assignee(task_id, organization_id, user_id, done_on)
SELECT t.id, t.organization_id, t.responsible_user_id, CASE WHEN t.status = 'done' THEN t.done_on END FROM task t
 WHERE t.responsible_user_id IS NOT NULL AND t.responsible_id IS NULL ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION task_first_assignee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.responsible_id IS NOT NULL THEN
    INSERT INTO task_assignee(task_id, organization_id, profile_id) VALUES (NEW.id, NEW.organization_id, NEW.responsible_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.responsible_user_id IS NOT NULL THEN
    INSERT INTO task_assignee(task_id, organization_id, user_id) VALUES (NEW.id, NEW.organization_id, NEW.responsible_user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS task_first_assignee ON task;
CREATE TRIGGER task_first_assignee AFTER INSERT OR UPDATE OF responsible_id, responsible_user_id ON task FOR EACH ROW EXECUTE FUNCTION task_first_assignee();

-- 2 to 7: the mode of completion, a meeting (date and times) apart from the
-- deadline, a place, a web link, an amount, a weekly rhythm and an end to a
-- repetition, the expense recorded from the task, the affiliation due.
ALTER TABLE task
  ADD COLUMN IF NOT EXISTS completion text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS meeting_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES calendar_place(id),
  ADD COLUMN IF NOT EXISTS shared_venue_id uuid REFERENCES shared_venue(id),
  ADD COLUMN IF NOT EXISTS free_location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS link_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS recurrence_until date,
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES finance_transaction(id),
  ADD COLUMN IF NOT EXISTS affiliation_due_id uuid REFERENCES affiliation_due(id);
DO $$ BEGIN
  ALTER TABLE task ADD CONSTRAINT task_completion_check CHECK (completion IN ('any', 'each'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE task ADD CONSTRAINT task_meeting_check CHECK (meeting_ends_at IS NULL OR (meeting_starts_at IS NOT NULL AND meeting_ends_at > meeting_starts_at));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE task ADD CONSTRAINT task_place_text_check CHECK (length(free_location) <= 300 AND length(link_url) <= 500 AND (link_url = '' OR link_url ~ '^https?://'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE task ADD CONSTRAINT task_amount_check CHECK (amount_cents IS NULL OR amount_cents BETWEEN 0 AND 100000000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE task DROP CONSTRAINT IF EXISTS task_recurrence_check;
ALTER TABLE task ADD CONSTRAINT task_recurrence_check CHECK (recurrence IN ('none', 'weekly', 'monthly', 'yearly'));
CREATE UNIQUE INDEX IF NOT EXISTS task_affiliation_due ON task(affiliation_due_id) WHERE affiliation_due_id IS NOT NULL AND status <> 'done';

-- 4: templates kept by the club (archived rather than deleted), with their category.
ALTER TABLE task_template
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text;
