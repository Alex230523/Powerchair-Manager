-- A4: a light CRM on top of the contact book.
-- 1. Organisations: a contact belongs to zero or one organisation. The free
--    text organization_name stays (kept in sync) so nothing is lost.
CREATE TABLE IF NOT EXISTS contact_organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('company', 'public', 'foundation', 'federation', 'supplier', 'venue', 'media', 'other')),
  website text NOT NULL DEFAULT '' CHECK (length(website) <= 300),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_organization_name ON contact_organization(organization_id, lower(trim(name)));

ALTER TABLE contact ADD COLUMN IF NOT EXISTS contact_organization_id uuid;
DO $$ BEGIN
  ALTER TABLE contact ADD CONSTRAINT contact_contact_organization_fkey FOREIGN KEY (contact_organization_id, organization_id) REFERENCES contact_organization(id, organization_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The organisations already written as text become organisations, typed from the contact's tags.
INSERT INTO contact_organization(organization_id, name, kind, created_by)
SELECT DISTINCT ON (c.organization_id, lower(trim(c.organization_name))) c.organization_id, trim(c.organization_name),
       CASE WHEN 'public' = ANY(c.tags) THEN 'public' WHEN 'federation' = ANY(c.tags) THEN 'federation' WHEN 'venue' = ANY(c.tags) THEN 'venue'
            WHEN 'press' = ANY(c.tags) THEN 'media' WHEN 'supplier' = ANY(c.tags) THEN 'supplier' WHEN 'sponsor' = ANY(c.tags) THEN 'company' ELSE 'other' END,
       c.created_by
  FROM contact c
 WHERE length(trim(c.organization_name)) >= 2
 ORDER BY c.organization_id, lower(trim(c.organization_name)), c.created_at
ON CONFLICT DO NOTHING;
UPDATE contact c SET contact_organization_id = o.id
  FROM contact_organization o
 WHERE c.contact_organization_id IS NULL AND o.organization_id = c.organization_id AND lower(trim(o.name)) = lower(trim(c.organization_name));

-- 9. GDPR: the legal basis and whether the person agrees to be contacted.
ALTER TABLE contact ADD COLUMN IF NOT EXISTS legal_basis text NOT NULL DEFAULT 'legitimate_interest';
ALTER TABLE contact ADD COLUMN IF NOT EXISTS contact_ok boolean NOT NULL DEFAULT true;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS consent_on date;
DO $$ BEGIN
  ALTER TABLE contact ADD CONSTRAINT contact_legal_basis_check CHECK (legal_basis IN ('legitimate_interest', 'consent', 'contract', 'legal_obligation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. The exchange log: call, email, meeting, note, or a mail the application sent.
CREATE TABLE IF NOT EXISTS contact_interaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('call', 'email', 'meeting', 'note', 'sent')),
  happened_on date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 300),
  author_id text REFERENCES "user"(id),
  source text NOT NULL DEFAULT '' CHECK (length(source) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contact_id, organization_id) REFERENCES contact(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS contact_interaction_contact ON contact_interaction(organization_id, contact_id, happened_on DESC);

-- 4. A contact's next action is a task of the central to-do.
ALTER TABLE funding_task ADD COLUMN IF NOT EXISTS contact_id uuid;
DO $$ BEGIN
  ALTER TABLE funding_task ADD CONSTRAINT funding_task_contact_fkey FOREIGN KEY (contact_id, organization_id) REFERENCES contact(id, organization_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2 and 6. A chair's supplier and a donation's donor can be contacts.
ALTER TABLE equipment_chair ADD COLUMN IF NOT EXISTS supplier_contact_id uuid;
DO $$ BEGIN
  ALTER TABLE equipment_chair ADD CONSTRAINT equipment_chair_supplier_fkey FOREIGN KEY (supplier_contact_id, organization_id) REFERENCES contact(id, organization_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE fundraising_movement ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contact(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fundraising_movement_contact ON fundraising_movement(contact_id) WHERE contact_id IS NOT NULL;
