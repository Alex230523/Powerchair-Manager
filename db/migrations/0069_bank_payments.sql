-- B1 (lot 09): bank accounts, structured communications, statement lines
-- and their reconciliation.

-- 1. The club's bank accounts; one is the account of the dues.
CREATE TABLE IF NOT EXISTS bank_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 80),
  iban text NOT NULL CHECK (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'),
  bic text NOT NULL DEFAULT '' CHECK (bic = '' OR bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  holder text NOT NULL DEFAULT '' CHECK (length(holder) <= 70),
  for_dues boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, iban),
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_account_one_for_dues ON bank_account(organization_id) WHERE for_dues AND NOT archived;
-- The IBAN already written in the club's identity becomes its first account.
INSERT INTO bank_account(organization_id, label, iban, holder, for_dues)
SELECT id, 'Compte principal', upper(regexp_replace(iban, '\s', '', 'g')), left(name, 70), true
  FROM organization
 WHERE kind = 'club' AND iban IS NOT NULL AND upper(regexp_replace(iban, '\s', '', 'g')) ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$'
ON CONFLICT DO NOTHING;

-- 2. Structured communications: ten digits from one sequence and the
--    check digits (mod 97, 97 for 0). Stable: given once, never changed.
CREATE SEQUENCE IF NOT EXISTS payment_reference_seq START WITH 1000001;
CREATE OR REPLACE FUNCTION payment_reference() RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint := nextval('payment_reference_seq'); r int;
BEGIN
  r := (n % 97)::int;
  IF r = 0 THEN r := 97; END IF;
  RETURN lpad(n::text, 10, '0') || lpad(r::text, 2, '0');
END $$;
ALTER TABLE dues_receivable ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE dues_installment ADD COLUMN IF NOT EXISTS reference text;
UPDATE dues_receivable SET reference = payment_reference() WHERE reference IS NULL;
UPDATE dues_installment SET reference = payment_reference() WHERE reference IS NULL;
ALTER TABLE dues_receivable ALTER COLUMN reference SET DEFAULT payment_reference();
ALTER TABLE dues_installment ALTER COLUMN reference SET DEFAULT payment_reference();
ALTER TABLE dues_receivable ALTER COLUMN reference SET NOT NULL;
ALTER TABLE dues_installment ALTER COLUMN reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dues_receivable_reference ON dues_receivable(reference);
CREATE UNIQUE INDEX IF NOT EXISTS dues_installment_reference ON dues_installment(reference);

-- 3. Imports and their lines; a line's fingerprint is unique in the club:
--    importing the same statement again creates nothing.
CREATE TABLE IF NOT EXISTS bank_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  bank_account_id uuid,
  format text NOT NULL CHECK (format IN ('csv', 'xlsx', 'coda', 'camt')),
  bank text NOT NULL DEFAULT 'other' CHECK (bank IN ('belfius', 'bnp', 'ing', 'kbc', 'other')),
  filename text NOT NULL DEFAULT '' CHECK (length(filename) <= 160),
  lines integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  imported_by text REFERENCES "user"(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (bank_account_id, organization_id) REFERENCES bank_account(id, organization_id)
);
CREATE TABLE IF NOT EXISTS bank_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES bank_import(id) ON DELETE CASCADE,
  bank_account_id uuid,
  booked_on date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents <> 0 AND abs(amount_cents) <= 100000000),
  counterparty text NOT NULL DEFAULT '' CHECK (length(counterparty) <= 160),
  counterparty_iban text NOT NULL DEFAULT '' CHECK (length(counterparty_iban) <= 34),
  communication text NOT NULL DEFAULT '' CHECK (length(communication) <= 400),
  bank_ref text NOT NULL DEFAULT '' CHECK (length(bank_ref) <= 80),
  reference text CHECK (reference IS NULL OR reference ~ '^[0-9]{12}$'),
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'matched', 'ignored')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, fingerprint),
  UNIQUE (id, organization_id),
  FOREIGN KEY (bank_account_id, organization_id) REFERENCES bank_account(id, organization_id)
);
CREATE INDEX IF NOT EXISTS bank_line_open ON bank_line(organization_id, status, booked_on DESC);

-- 4. Each part of a line goes somewhere: a receivable, a credit carried to
--    a person, a pot, a sponsor, a grant instalment, or another income or
--    expense. One ledger line per part, linked once and for all.
CREATE TABLE IF NOT EXISTS bank_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  line_id uuid NOT NULL,
  target text NOT NULL CHECK (target IN ('receivable', 'credit', 'pot', 'partner', 'grant', 'other')),
  target_id uuid,
  amount_cents integer NOT NULL CHECK (amount_cents >= 1),
  automatic boolean NOT NULL DEFAULT false,
  transaction_id uuid UNIQUE REFERENCES finance_transaction(id),
  -- The pot movement or the grant instalment written with it.
  linked_id uuid,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by text REFERENCES "user"(id),
  cancel_reason text NOT NULL DEFAULT '' CHECK (cancelled_at IS NULL OR length(trim(cancel_reason)) >= 5),
  FOREIGN KEY (line_id, organization_id) REFERENCES bank_line(id, organization_id)
);
CREATE INDEX IF NOT EXISTS bank_allocation_line ON bank_allocation(line_id) WHERE cancelled_at IS NULL;

-- The ledger knows the bank line of a payment, and the person a credit belongs to.
ALTER TABLE finance_transaction ADD COLUMN IF NOT EXISTS bank_line_id uuid REFERENCES bank_line(id);
ALTER TABLE finance_transaction ADD COLUMN IF NOT EXISTS credit_profile_id uuid REFERENCES club_person(id);
CREATE INDEX IF NOT EXISTS finance_transaction_credit ON finance_transaction(organization_id, credit_profile_id) WHERE credit_profile_id IS NOT NULL AND cancelled_at IS NULL;

-- 5. The column map chosen for a bank's CSV or XLSX, remembered per club.
CREATE TABLE IF NOT EXISTS bank_mapping (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  bank text NOT NULL CHECK (bank IN ('belfius', 'bnp', 'ing', 'kbc', 'other')),
  columns jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, bank)
);
