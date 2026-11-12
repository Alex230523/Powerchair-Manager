-- 12/11/2026: the task board.
-- 1. The order chosen by dragging, within a group (null: by date, as before).
ALTER TABLE task ADD COLUMN IF NOT EXISTS board_position integer;
-- 2. What to bring for a task (balls, batteries, the first aid kit).
ALTER TABLE task ADD COLUMN IF NOT EXISTS materials text[] NOT NULL DEFAULT '{}' CHECK (cardinality(materials) <= 30);
-- 3. The club's own categories, beside the platform's.
CREATE TABLE IF NOT EXISTS task_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
ALTER TABLE task ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES task_list(id) ON DELETE SET NULL;
-- 4. The order of the groups on the page (categories and lists), chosen by the club.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS task_group_order text[] NOT NULL DEFAULT '{}' CHECK (cardinality(task_group_order) <= 100);
-- 5. Each person given a task is told once, whatever created it (the hourly task tells the ones not told yet).
ALTER TABLE task_assignee ADD COLUMN IF NOT EXISTS told_at timestamptz;
UPDATE task_assignee SET told_at = created_at WHERE told_at IS NULL;
CREATE INDEX IF NOT EXISTS task_assignee_untold ON task_assignee (created_at) WHERE told_at IS NULL;
