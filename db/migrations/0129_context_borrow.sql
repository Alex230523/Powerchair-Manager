-- 06/11/2026 (console, step 3b): an operator opens an organisation as its
-- president for a short while (support), with a reason: a mandate limited in
-- time is written, the presidency is told, the organisation's own journal
-- keeps it, and the operator ends it early from the console.
CREATE TABLE IF NOT EXISTS platform_borrow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id text NOT NULL REFERENCES "user"(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  mandate_id uuid NOT NULL REFERENCES role_assignment(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  notified integer NOT NULL DEFAULT 0,
  CHECK (expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS platform_borrow_org ON platform_borrow(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS platform_borrow_open ON platform_borrow(operator_id) WHERE ended_at IS NULL;
