-- 05/11/2026 (lot 6): the decisions of the federation's commission, written
-- by the application (a transfer validated or refused, a force majeure, a
-- fine, an international transfer) or by hand, each signed by the members
-- of the commission.
CREATE TABLE IF NOT EXISTS federation_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('transfer', 'force_majeure', 'fine', 'international', 'discipline', 'other')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 2 AND 200),
  decision text NOT NULL CHECK (length(trim(decision)) BETWEEN 2 AND 2000),
  reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 120),
  decided_on date NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS federation_decision_fed ON federation_decision(federation_id, decided_on DESC);
CREATE TABLE IF NOT EXISTS federation_decision_signature (
  decision_id uuid NOT NULL REFERENCES federation_decision(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id),
  signed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, user_id)
);
