-- 11: the equipment page, improved. A chair's label with its model, nested
-- storage places (two levels), the club's categories (the current ones as
-- system categories), and loans of small material (a quantity) or to a
-- player of the club, in the same loan table.

-- « Strike 3 · Permobil Strike Force », wherever a chair appears.
CREATE OR REPLACE FUNCTION chair_label(chair uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT c.name || COALESCE(' · ' || NULLIF(trim(concat_ws(' ', NULLIF(trim(m.brand), ''), NULLIF(trim(m.name), ''))), ''), '')
    FROM equipment_chair c LEFT JOIN chair_model m ON m.id = c.model_id WHERE c.id = chair
$$;

-- Nested places: « Local du club › Étagère A », two levels at most.
ALTER TABLE storage_location ADD COLUMN IF NOT EXISTS parent_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_location_parent_fk') THEN
    ALTER TABLE storage_location ADD CONSTRAINT storage_location_parent_fk FOREIGN KEY (parent_id, organization_id) REFERENCES storage_location(id, organization_id);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION storage_two_levels() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'storage place under itself' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM storage_location WHERE id = NEW.parent_id AND parent_id IS NOT NULL) THEN RAISE EXCEPTION 'third level' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM storage_location WHERE parent_id = NEW.id) THEN RAISE EXCEPTION 'third level' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS storage_two_levels ON storage_location;
CREATE TRIGGER storage_two_levels BEFORE INSERT OR UPDATE OF parent_id ON storage_location FOR EACH ROW EXECUTE FUNCTION storage_two_levels();
CREATE OR REPLACE FUNCTION storage_path(place uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p.name || ' › ', '') || l.name FROM storage_location l LEFT JOIN storage_location p ON p.id = l.parent_id WHERE l.id = place
$$;
-- A name is unique among the places of the same level.
DROP INDEX IF EXISTS storage_location_name;
CREATE UNIQUE INDEX IF NOT EXISTS storage_location_name_level ON storage_location(organization_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name))) WHERE NOT archived;

-- The club's categories. system_key: one of the categories the alerts know
-- (batteries, first aid…), never deleted; the others are the club's own.
CREATE TABLE IF NOT EXISTS equipment_category (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 system_key text CHECK (system_key IN ('ball', 'cone', 'first_aid', 'battery', 'charger', 'spare_part', 'jersey', 'protection', 'tool', 'other')),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
 archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, organization_id),
 CHECK (system_key IS NULL OR NOT archived)
);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_category_system ON equipment_category(organization_id, system_key) WHERE system_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS equipment_category_name ON equipment_category(organization_id, lower(trim(name))) WHERE NOT archived;
ALTER TABLE equipment_item ADD COLUMN IF NOT EXISTS category_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_item_category_fk') THEN
    ALTER TABLE equipment_item ADD CONSTRAINT equipment_item_category_fk FOREIGN KEY (category_id, organization_id) REFERENCES equipment_category(id, organization_id);
  END IF;
END $$;

-- Loans of small material (a quantity) and loans to a player of the club.
ALTER TABLE equipment_loan ALTER COLUMN chair_id DROP NOT NULL;
ALTER TABLE equipment_loan ALTER COLUMN borrower_id DROP NOT NULL;
ALTER TABLE equipment_loan ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES equipment_item(id);
ALTER TABLE equipment_loan ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10000);
ALTER TABLE equipment_loan ADD COLUMN IF NOT EXISTS borrower_profile_id uuid REFERENCES club_person(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_loan_one_thing') THEN
    ALTER TABLE equipment_loan ADD CONSTRAINT equipment_loan_one_thing CHECK ((chair_id IS NULL) <> (item_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_loan_one_borrower') THEN
    ALTER TABLE equipment_loan ADD CONSTRAINT equipment_loan_one_borrower CHECK ((borrower_id IS NULL) <> (borrower_profile_id IS NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS equipment_loan_item ON equipment_loan(item_id, status) WHERE item_id IS NOT NULL;
