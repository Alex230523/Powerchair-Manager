-- B2: background tasks run by a scheduler (cron routes), one line per run.
-- No personal data: the task's name, when, whether it went well, counts.
CREATE TABLE IF NOT EXISTS job_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL CHECK (length(job) BETWEEN 1 AND 60),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 80)
);
CREATE INDEX IF NOT EXISTS job_run_recent ON job_run(job, started_at DESC);
