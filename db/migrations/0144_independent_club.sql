-- 12/11/2026: a club can use the platform without a federation.
-- 1. The request a club's future president sends from « Rejoindre la
--    plateforme »: confirmed by e-mail, then read by the platform's team, who
--    accepts it (the club is created, its president invited) or refuses it.
--    No account exists before the acceptance.
CREATE TABLE IF NOT EXISTS club_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name text NOT NULL CHECK (length(trim(club_name)) BETWEEN 2 AND 120),
  country_code text NOT NULL REFERENCES country(code),
  city text NOT NULL DEFAULT '' CHECK (length(city) <= 120),
  president_name text NOT NULL CHECK (length(trim(president_name)) BETWEEN 2 AND 120),
  president_email text NOT NULL CHECK (president_email = lower(president_email) AND length(president_email) BETWEEN 3 AND 254),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 1000),
  discount_code text NOT NULL DEFAULT '' CHECK (length(discount_code) <= 30),
  locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'nl', 'en')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'unconfirmed' CHECK (state IN ('unconfirmed', 'pending', 'approved', 'refused')),
  confirmed_at timestamptz,
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  decision_reason text NOT NULL DEFAULT '' CHECK (length(decision_reason) <= 500),
  organization_id uuid REFERENCES organization(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state IN ('approved', 'refused')) = (decided_at IS NOT NULL)),
  CHECK ((state = 'approved') = (organization_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS club_request_state ON club_request (state, created_at);
-- One request waiting per address at a time.
CREATE UNIQUE INDEX IF NOT EXISTS club_request_open_email ON club_request (president_email) WHERE state IN ('unconfirmed', 'pending');

-- 2. The plan of a club without a federation: 99 € a year, 30 days of trial.
INSERT INTO billing_plan(code, name, amount_cents, period, basis, active)
VALUES ('club-independant', 'Club indépendant', 9900, 'year', 'organization', true)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS trial_ends_on date;
-- Invoiced by the daily task (the trial's end, then each year), not by hand.
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS auto_invoice boolean NOT NULL DEFAULT false;

-- 3. Discount codes, made in the console and given to clubs.
CREATE TABLE IF NOT EXISTS billing_discount (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{4,30}$'),
  percent integer CHECK (percent BETWEEN 1 AND 100),
  amount_cents integer CHECK (amount_cents BETWEEN 1 AND 1000000),
  -- How many invoices it lowers: one (the first), several, or all (null).
  cycles integer CHECK (cycles BETWEEN 1 AND 10),
  valid_until date,
  max_uses integer CHECK (max_uses BETWEEN 1 AND 10000),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((percent IS NULL) <> (amount_cents IS NULL)),
  CHECK (max_uses IS NULL OR uses <= max_uses)
);
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS discount_id uuid REFERENCES billing_discount(id);
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS discount_cycles_left integer CHECK (discount_cycles_left >= 0);
ALTER TABLE billing_invoice ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);
ALTER TABLE billing_invoice ADD COLUMN IF NOT EXISTS discount_code text NOT NULL DEFAULT '' CHECK (length(discount_code) <= 30);

-- 4. An invitation sent by the platform's team (the president of a club it accepted).
ALTER TABLE invitation ADD COLUMN IF NOT EXISTS issued_by_platform boolean NOT NULL DEFAULT false;
