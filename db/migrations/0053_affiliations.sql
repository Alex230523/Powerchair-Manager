-- Wave 17 (N2): affiliations and federal fees the club pays (federation,
-- insurance, others). A definition belongs to a federation (for all its
-- clubs or chosen ones) or to a club; each club owes one due per period,
-- marked « en ordre » when paid, and ticks its line in « Statut du club ».
CREATE TABLE affiliation_fee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  contact_id uuid REFERENCES contact(id),
  basis text NOT NULL CHECK (basis IN ('player', 'club')),
  frequency text NOT NULL CHECK (frequency IN ('annual', 'monthly')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 10000000),
  opens_month smallint NOT NULL DEFAULT 8 CHECK (opens_month BETWEEN 1 AND 12),
  opens_day smallint NOT NULL DEFAULT 1 CHECK (opens_day BETWEEN 1 AND 28),
  due_days integer CHECK (due_days BETWEEN 1 AND 366),
  due_month smallint CHECK (due_month BETWEEN 1 AND 12),
  due_day smallint CHECK (due_day BETWEEN 1 AND 31),
  all_clubs boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((due_days IS NOT NULL AND due_month IS NULL AND due_day IS NULL) OR (due_days IS NULL AND due_month IS NOT NULL AND due_day IS NOT NULL)),
  CHECK (frequency = 'annual' OR due_days IS NOT NULL)
);
CREATE INDEX affiliation_fee_owner ON affiliation_fee(organization_id) WHERE NOT archived;
-- A federal definition for chosen clubs only.
CREATE TABLE affiliation_fee_club (
  fee_id uuid NOT NULL REFERENCES affiliation_fee(id),
  club_id uuid NOT NULL REFERENCES organization(id),
  PRIMARY KEY (fee_id, club_id)
);
CREATE TABLE affiliation_due (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id uuid NOT NULL REFERENCES affiliation_fee(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  opens_on date NOT NULL,
  due_on date NOT NULL,
  players integer CHECK (players >= 0),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 1000000000),
  paid_on date,
  marked_by text REFERENCES "user"(id),
  transaction_id uuid REFERENCES finance_transaction(id),
  proof_url text NOT NULL DEFAULT '' CHECK (proof_url = '' OR (proof_url ~ '^https://' AND length(proof_url) <= 500)),
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fee_id, organization_id, period),
  CHECK (due_on >= opens_on)
);
CREATE INDEX affiliation_due_club ON affiliation_due(organization_id, due_on);

ALTER TABLE club_obligation ADD COLUMN affiliation_due_id uuid REFERENCES affiliation_due(id);
ALTER TABLE club_obligation DROP CONSTRAINT club_obligation_auto_source_check;
ALTER TABLE club_obligation ADD CONSTRAINT club_obligation_auto_source_check CHECK (auto_source IN ('none', 'accounts_approved', 'accounts_filed', 'affiliation'));
CREATE UNIQUE INDEX club_obligation_affiliation ON club_obligation(affiliation_due_id) WHERE affiliation_due_id IS NOT NULL;

ALTER TABLE finance_transaction DROP CONSTRAINT finance_transaction_category_check;
ALTER TABLE finance_transaction ADD CONSTRAINT finance_transaction_category_check CHECK (category IN ('dues','subsidy','sponsor','donation','event','equipment','venue','travel','competition','insurance','affiliation','other'));

ALTER TABLE undo_action DROP CONSTRAINT undo_action_kind_check;
ALTER TABLE undo_action ADD CONSTRAINT undo_action_kind_check CHECK (kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','messageHide','payment','eventCancel','registrationDecision','affiliationPaid'));
