-- B8: tax receipts for gifts (form 281.71) and the Belcotax-on-Web export,
-- only for clubs approved by the SPF Finances. Off by default: nothing shows.

-- 1. The approval, answered by each club for itself.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS tax_approved boolean NOT NULL DEFAULT false;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS tax_approval_number text NOT NULL DEFAULT '';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS tax_approval_from date;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS tax_approval_to date;
-- The legal minimum for a receipt (40 € a year and per donor), set by the club.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS tax_threshold_cents integer NOT NULL DEFAULT 4000;
DO $$ BEGIN
  ALTER TABLE organization ADD CONSTRAINT organization_tax_approval_check CHECK (
    length(tax_approval_number) <= 60 AND tax_threshold_cents BETWEEN 0 AND 1000000
    AND (NOT tax_approved OR (length(trim(tax_approval_number)) >= 2 AND tax_approval_from IS NOT NULL AND tax_approval_to IS NOT NULL AND tax_approval_to >= tax_approval_from)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The dedicated right to see a donor's national number.
ALTER TABLE role_assignment DROP CONSTRAINT IF EXISTS role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT IF EXISTS invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read','tax.identity']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read','tax.identity']::text[]);

-- 3. Donors: a person (national number, sealed at rest) or a company (BCE).
CREATE TABLE IF NOT EXISTS tax_donor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('person', 'company')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  street text NOT NULL DEFAULT '' CHECK (length(street) <= 160),
  postal_code text NOT NULL DEFAULT '' CHECK (length(postal_code) <= 12),
  city text NOT NULL DEFAULT '' CHECK (length(city) <= 80),
  country text NOT NULL DEFAULT 'BE' CHECK (country ~ '^[A-Z]{2}$'),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  -- Sealed with the platform key (AES-GCM), never in clear in the database.
  national_sealed text,
  -- A keyed hash of the number, to find the same donor twice without opening it.
  national_hash text,
  national_set_at timestamptz,
  company_number text NOT NULL DEFAULT '' CHECK (company_number = '' OR company_number ~ '^[01][0-9]{9}$'),
  contact_id uuid,
  last_gift_on date,
  -- Ten years after the last gift the national number and the address are purged.
  purge_after date,
  purged_at timestamptz,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'person' OR national_sealed IS NULL),
  CHECK ((national_sealed IS NULL) = (national_hash IS NULL)),
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS tax_donor_org ON tax_donor(organization_id, name);

-- 4. What was given: only a gift without anything in return counts.
CREATE TABLE IF NOT EXISTS tax_gift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  donor_id uuid NOT NULL,
  received_on date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  nature text NOT NULL CHECK (nature IN ('gift', 'in_kind', 'purchase', 'sponsor', 'dues')),
  transaction_id uuid UNIQUE,
  movement_id uuid UNIQUE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancel_reason text,
  FOREIGN KEY (donor_id, organization_id) REFERENCES tax_donor(id, organization_id)
);
CREATE INDEX IF NOT EXISTS tax_gift_year ON tax_gift(organization_id, donor_id, received_on);

-- 5. Receipts: one number per donor and year; a correction replaces, a cancellation keeps the trace.
CREATE TABLE IF NOT EXISTS tax_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  donor_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  sequence integer NOT NULL CHECK (sequence >= 1),
  amount_cents integer NOT NULL CHECK (amount_cents >= 1),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'corrected', 'cancelled')),
  replaces_id uuid REFERENCES tax_receipt(id),
  -- The donor and the club as printed (the national number is never copied here).
  snapshot jsonb NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  token_hash text UNIQUE,
  issued_by text REFERENCES "user"(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz,
  closed_at timestamptz,
  closed_by text REFERENCES "user"(id),
  FOREIGN KEY (donor_id, organization_id) REFERENCES tax_donor(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_receipt_current ON tax_receipt(organization_id, year, donor_id) WHERE status = 'issued';
CREATE UNIQUE INDEX IF NOT EXISTS tax_receipt_number ON tax_receipt(organization_id, year, sequence) WHERE status = 'issued';

-- 6. The secure form sent to a donor for their national number (never a transfer's communication).
CREATE TABLE IF NOT EXISTS tax_identity_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  donor_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (donor_id, organization_id) REFERENCES tax_donor(id, organization_id)
);

-- 7. The receipt and the request to the donor, a resource of their own for the mail queue.
ALTER TABLE mail_job DROP CONSTRAINT IF EXISTS mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK (resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license','newsletter','event_mail','funding','digest','automation','tax'));
