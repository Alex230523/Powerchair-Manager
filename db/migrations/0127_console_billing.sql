-- 05/11/2026 (console, steps 3 and 4): an organisation suspended by the
-- platform (read only for its members, with the reason), and the billing of
-- the platform's subscriptions: plans, one subscription per organisation,
-- invoices numbered per year, reminders by steps (by hand or by the daily
-- task). No card data: payments are recorded by the operator.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS suspended_reason text NOT NULL DEFAULT '' CHECK (length(suspended_reason) <= 500);

CREATE TABLE IF NOT EXISTS billing_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 100000000),
  period text NOT NULL CHECK (period IN ('month', 'year')),
  -- Per organisation, or per active player at the invoice's date.
  basis text NOT NULL CHECK (basis IN ('organization', 'player')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  plan_id uuid NOT NULL REFERENCES billing_plan(id),
  started_on date NOT NULL,
  ended_on date,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR ended_on >= started_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_subscription_open ON billing_subscription(organization_id) WHERE ended_on IS NULL;
CREATE TABLE IF NOT EXISTS billing_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  subscription_id uuid REFERENCES billing_subscription(id),
  number text NOT NULL UNIQUE CHECK (number ~ '^F-[0-9]{4}-[0-9]{4}$'),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 200),
  period_from date NOT NULL,
  period_to date NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
  unit_cents integer NOT NULL CHECK (unit_cents BETWEEN 0 AND 100000000),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 1000000000),
  issued_on date NOT NULL,
  due_on date NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sent', 'paid', 'cancelled')),
  sent_at timestamptz,
  paid_on date,
  cancelled_at timestamptz,
  reminders integer NOT NULL DEFAULT 0 CHECK (reminders BETWEEN 0 AND 3),
  last_reminder_at timestamptz,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_to >= period_from),
  CHECK (due_on >= issued_on)
);
CREATE INDEX IF NOT EXISTS billing_invoice_org ON billing_invoice(organization_id, issued_on DESC);
CREATE INDEX IF NOT EXISTS billing_invoice_open ON billing_invoice(due_on) WHERE state = 'sent';
CREATE TABLE IF NOT EXISTS billing_reminder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES billing_invoice(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 3),
  -- Null when the daily task sent it.
  sent_by text REFERENCES "user"(id),
  recipients integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_reminder_invoice ON billing_reminder(invoice_id, sent_at DESC);
