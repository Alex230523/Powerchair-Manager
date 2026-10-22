-- A2: « Subsides & sponsors », one page in two views.
-- Grants: the date the call opens, the period covered (from starts_on to the
-- existing ends_on) and the money received in one or more instalments.
ALTER TABLE grant_application ADD COLUMN IF NOT EXISTS opens_on date;
ALTER TABLE grant_application ADD COLUMN IF NOT EXISTS starts_on date;
DO $$ BEGIN
  ALTER TABLE grant_application ADD CONSTRAINT grant_application_period_check CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS grant_payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  grant_id uuid NOT NULL,
  received_on date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (grant_id, organization_id) REFERENCES grant_application(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS grant_payment_grant ON grant_payment(organization_id, grant_id, received_on);

-- Sponsors: the person of the club in charge and the date of the last contact
-- (written by hand now, by the exchange log of A4 later).
ALTER TABLE partner ADD COLUMN IF NOT EXISTS responsible_id uuid;
ALTER TABLE partner ADD COLUMN IF NOT EXISTS last_contact_on date;
DO $$ BEGIN
  ALTER TABLE partner ADD CONSTRAINT partner_responsible_fkey FOREIGN KEY (responsible_id, organization_id) REFERENCES club_person(id, organization_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
