-- A1: the organisation's central to-do. The table funding_task (wave 15,
-- made common to every type in wave 17 O1) becomes the tasks of the club
-- or the federation: nothing is copied, every module that already writes
-- tasks keeps working, and the view org_task gives it its name.

-- 1. A category, in a fixed order on the page (clubs, then the federation).
ALTER TABLE funding_task ADD COLUMN category text;
UPDATE funding_task SET category = CASE kind
  WHEN 'sponsor' THEN 'sponsors' WHEN 'grant' THEN 'grants' WHEN 'obligation' THEN 'admin' WHEN 'documents' THEN 'admin'
  WHEN 'equipment' THEN 'equipment' WHEN 'training' THEN 'sport' WHEN 'transport' THEN 'events' ELSE 'other' END;
-- Older code that writes a task without a category: it follows the type.
CREATE FUNCTION funding_task_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := CASE NEW.kind
      WHEN 'sponsor' THEN 'sponsors' WHEN 'grant' THEN 'grants' WHEN 'obligation' THEN 'admin' WHEN 'documents' THEN 'admin'
      WHEN 'equipment' THEN 'equipment' WHEN 'training' THEN 'sport' WHEN 'transport' THEN 'events' ELSE 'other' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER funding_task_category BEFORE INSERT ON funding_task FOR EACH ROW EXECUTE FUNCTION funding_task_category();
ALTER TABLE funding_task ALTER COLUMN category SET NOT NULL;
ALTER TABLE funding_task ADD CONSTRAINT funding_task_category_check CHECK (category IN (
  'affiliation', 'admin', 'grants', 'sponsors', 'fundraising', 'equipment', 'sport', 'events', 'other',
  'fed_affiliations', 'fed_licences', 'fed_competitions', 'fed_admin', 'fed_finance', 'fed_other'));

-- 2. « En cours » between « À faire » and « Fait ».
ALTER TABLE funding_task DROP CONSTRAINT funding_task_status_check;
ALTER TABLE funding_task ADD CONSTRAINT funding_task_status_check CHECK (status IN ('todo', 'doing', 'done'));
ALTER TABLE funding_task DROP CONSTRAINT funding_task_check1;
ALTER TABLE funding_task ADD CONSTRAINT funding_task_check1 CHECK (status <> 'done' OR done_on IS NOT NULL);

-- 3. Priority, sub-tasks, recurrence, team, federation responsible.
ALTER TABLE funding_task
  ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checklist) = 'array' AND jsonb_array_length(checklist) <= 50),
  ADD COLUMN recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly', 'yearly')),
  ADD COLUMN team_id uuid,
  ADD COLUMN responsible_user_id text REFERENCES "user"(id),
  ADD CONSTRAINT funding_task_team_fkey FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id);

-- 4. Tasks the application creates by itself: one per cause and due date
--    (source_key), closed by themselves when the cause is resolved. The
--    title is shown in the reader's language from source_kind and params.
ALTER TABLE funding_task
  ADD COLUMN source_key text CHECK (source_key IS NULL OR length(source_key) <= 300),
  ADD COLUMN source_kind text NOT NULL DEFAULT '' CHECK (length(source_kind) <= 60),
  ADD COLUMN source_params jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN auto_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN pot_id uuid REFERENCES fundraising_pot(id) ON DELETE SET NULL,
  ADD COLUMN document_id uuid REFERENCES club_document(id) ON DELETE SET NULL,
  ADD COLUMN receivable_id uuid REFERENCES dues_receivable(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX funding_task_source ON funding_task(organization_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX funding_task_user ON funding_task(organization_id, responsible_user_id) WHERE status <> 'done';

-- 5. Comments on a task.
CREATE TABLE task_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  author_id text NOT NULL REFERENCES "user"(id),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, organization_id) REFERENCES funding_task(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX task_comment_task ON task_comment(task_id, created_at);

CREATE VIEW org_task AS SELECT * FROM funding_task;
