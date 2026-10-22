-- Wave 17 (Q1): equipment. Additive: the free-text columns stay (older
-- screens still write them) and are kept in step by the new code.

-- 1. Small material: cones join the categories.
ALTER TABLE equipment_item DROP CONSTRAINT equipment_item_category_check;
ALTER TABLE equipment_item ADD CONSTRAINT equipment_item_category_check
  CHECK (category IN ('ball', 'cone', 'first_aid', 'battery', 'charger', 'spare_part', 'jersey', 'protection', 'tool', 'other'));

-- 2. Chair models: a shared list (federation_id NULL, validated), and the
--    models a club proposes, validated or refused by its federation.
CREATE TABLE chair_model (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid REFERENCES organization(id),
  brand text NOT NULL DEFAULT '' CHECK (length(brand) <= 80),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('validated', 'proposed', 'refused')),
  proposed_by_org uuid REFERENCES organization(id),
  proposed_by text REFERENCES "user"(id),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chair_model_name ON chair_model (COALESCE(federation_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(brand)), lower(trim(name)));
INSERT INTO chair_model(name, status) VALUES ('Equalizer', 'validated'), ('Storm', 'validated'), ('Strike Force', 'validated');

ALTER TABLE equipment_chair ADD COLUMN model_id uuid REFERENCES chair_model(id);
-- The free text of each chair: the shared model of that name, otherwise a
-- model proposed to the club's federation.
INSERT INTO chair_model(federation_id, brand, name, status, proposed_by_org)
SELECT DISTINCT ON (o.federation_id, lower(trim(c.brand)), lower(trim(c.model))) o.federation_id, trim(c.brand), trim(c.model), 'proposed', c.organization_id
  FROM equipment_chair c JOIN organization o ON o.id = c.organization_id
 WHERE length(trim(c.model)) >= 2
   AND NOT EXISTS (SELECT 1 FROM chair_model m WHERE m.federation_id IS NULL AND m.status = 'validated' AND lower(trim(m.name)) = lower(trim(c.model)))
 ORDER BY o.federation_id, lower(trim(c.brand)), lower(trim(c.model)), c.created_at
ON CONFLICT DO NOTHING;
UPDATE equipment_chair c SET model_id = (
  SELECT m.id FROM chair_model m JOIN organization o ON o.id = c.organization_id
   WHERE lower(trim(m.name)) = lower(trim(c.model))
     AND ((m.federation_id IS NULL AND m.status = 'validated')
       OR (m.status = 'proposed' AND m.federation_id IS NOT DISTINCT FROM o.federation_id AND lower(trim(m.brand)) = lower(trim(c.brand))))
   ORDER BY (m.federation_id IS NULL) DESC LIMIT 1)
 WHERE length(trim(c.model)) >= 2;

-- 3. Storage places of a club (its room, a coach's garage, a sports hall).
CREATE TABLE storage_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  place_id uuid REFERENCES calendar_place(id),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  contact text NOT NULL DEFAULT '' CHECK (length(contact) <= 200),
  access text NOT NULL DEFAULT '' CHECK (length(access) <= 500),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX storage_location_name ON storage_location(organization_id, lower(trim(name))) WHERE NOT archived;
INSERT INTO storage_location(organization_id, name)
SELECT DISTINCT ON (organization_id, lower(trim(storage))) organization_id, trim(storage)
  FROM (SELECT organization_id, storage FROM equipment_chair UNION ALL SELECT organization_id, storage FROM equipment_item) x
 WHERE length(trim(storage)) >= 2
 ORDER BY organization_id, lower(trim(storage));
ALTER TABLE equipment_chair ADD COLUMN storage_location_id uuid;
ALTER TABLE equipment_chair ADD CONSTRAINT equipment_chair_storage_location_fkey FOREIGN KEY (storage_location_id, organization_id) REFERENCES storage_location(id, organization_id);
ALTER TABLE equipment_item ADD COLUMN storage_location_id uuid;
ALTER TABLE equipment_item ADD CONSTRAINT equipment_item_storage_location_fkey FOREIGN KEY (storage_location_id, organization_id) REFERENCES storage_location(id, organization_id);
UPDATE equipment_chair c SET storage_location_id = s.id FROM storage_location s WHERE s.organization_id = c.organization_id AND lower(trim(s.name)) = lower(trim(c.storage)) AND length(trim(c.storage)) >= 2;
UPDATE equipment_item i SET storage_location_id = s.id FROM storage_location s WHERE s.organization_id = i.organization_id AND lower(trim(s.name)) = lower(trim(i.storage)) AND length(trim(i.storage)) >= 2;

-- 4. Loans between clubs of a federation (and from the federation's own
--    fleet). A chair marked « Prêtable » is offered to the others.
ALTER TABLE equipment_chair ADD COLUMN lendable boolean NOT NULL DEFAULT false;
CREATE TABLE equipment_loan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chair_id uuid NOT NULL,
  lender_id uuid NOT NULL,
  borrower_id uuid NOT NULL REFERENCES organization(id),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  conditions text NOT NULL DEFAULT '' CHECK (length(conditions) <= 1000),
  deposit_cents integer CHECK (deposit_cents IS NULL OR deposit_cents BETWEEN 0 AND 10000000),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 1000),
  status text NOT NULL CHECK (status IN ('requested', 'accepted', 'ongoing', 'returned', 'refused', 'cancelled')),
  initiated_by text NOT NULL CHECK (initiated_by IN ('lender', 'borrower')),
  condition_out text NOT NULL DEFAULT '' CHECK (length(condition_out) <= 1000),
  condition_in text NOT NULL DEFAULT '' CHECK (length(condition_in) <= 1000),
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 1000),
  created_by text NOT NULL REFERENCES "user"(id),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  handed_at timestamptz,
  returned_at timestamptz,
  reminded_on date,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (lender_id <> borrower_id),
  FOREIGN KEY (chair_id, lender_id) REFERENCES equipment_chair(id, organization_id)
);
CREATE INDEX equipment_loan_chair ON equipment_loan(chair_id, status);
CREATE INDEX equipment_loan_borrower ON equipment_loan(borrower_id, status);
CREATE INDEX equipment_loan_lender ON equipment_loan(lender_id, status);
