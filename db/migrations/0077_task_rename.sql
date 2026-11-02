-- Technical fix 13.2: funding_task has carried every task of the club and
-- of the federation since A1; it takes its real name, task (and
-- funding_task_proof becomes task_proof). No row changes. Indexes,
-- constraints, the trigger and its function follow the new name. For one
-- version, the views funding_task and funding_task_proof (simple views, so
-- still writable) and org_task keep older deployments working.
ALTER TABLE funding_task RENAME TO task;
ALTER TABLE funding_task_proof RENAME TO task_proof;

DO $$
DECLARE r record;
BEGIN
  -- Constraints first: renaming one backed by an index renames the index too.
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl FROM pg_constraint c
     WHERE c.conrelid IN ('task'::regclass, 'task_proof'::regclass) AND c.conname LIKE 'funding\_task%'
  LOOP
    EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, regexp_replace(r.conname, '^funding_task', 'task'));
  END LOOP;
  FOR r IN
    SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('task', 'task_proof') AND indexname LIKE 'funding\_task%'
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, regexp_replace(r.indexname, '^funding_task', 'task'));
  END LOOP;
END $$;

ALTER TRIGGER funding_task_category ON task RENAME TO task_category;
ALTER FUNCTION funding_task_category() RENAME TO task_category;

-- Aliases for one version (older previews still running): to be dropped by
-- the next migration that touches tasks.
CREATE VIEW funding_task AS SELECT * FROM task;
CREATE VIEW funding_task_proof AS SELECT * FROM task_proof;
