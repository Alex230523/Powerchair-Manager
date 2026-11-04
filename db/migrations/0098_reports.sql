-- 19: two ways to report a problem. A remark on the application goes to
-- the project's GitHub issues (sent by the server, never the browser);
-- a chair's breakdown goes to the club (and to its owner when lent), with
-- its type and how serious it is. Additive.

CREATE TABLE IF NOT EXISTS app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id),
  organization_id uuid REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('bug', 'idea', 'text')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 4000),
  -- Page, language, screen, browser, version, role: never a name unless the person agreed to be contacted.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact boolean NOT NULL DEFAULT false,
  screenshot bytea CHECK (screenshot IS NULL OR octet_length(screenshot) <= 3145728),
  screenshot_type text CHECK (screenshot_type IS NULL OR screenshot_type = 'image/png'),
  screenshot_token text UNIQUE,
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received', 'in_progress', 'fixed')),
  issue_number integer,
  issue_url text,
  sent_at timestamptz,
  send_error text NOT NULL DEFAULT '' CHECK (length(send_error) <= 300),
  fixed_notified_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_feedback_user ON app_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_feedback_open ON app_feedback(state) WHERE state <> 'fixed';

ALTER TABLE chair_report
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other' CHECK (category IN ('battery', 'motor', 'wheels', 'joystick', 'safety', 'body', 'other')),
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'unusable' CHECK (severity IN ('usable', 'watch', 'unusable')),
  ADD COLUMN IF NOT EXISTS intervention_id uuid REFERENCES chair_intervention(id),
  ADD COLUMN IF NOT EXISTS reporter_told_at timestamptz;
