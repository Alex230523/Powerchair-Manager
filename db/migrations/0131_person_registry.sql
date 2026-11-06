-- 06/11/2026 (international, step 3): the person's identity across clubs
-- and countries, and the registry of classifications.
-- A person carries an identity code (shown on the player's sheet and in the
-- international dossier) that follows them from club to club; the registry
-- keeps every PF1/PF2 decision with the federation that classified, from a
-- classification day or written by hand; a player arriving from abroad gets
-- a sheet in the receiving club linked to the same person.
ALTER TABLE person ADD COLUMN IF NOT EXISTS identity_code text;
CREATE OR REPLACE FUNCTION pfm_person_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.identity_code IS NULL THEN
    NEW.identity_code := 'PFM-' || upper(substr(md5(gen_random_uuid()::text), 1, 10));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS person_identity ON person;
CREATE TRIGGER person_identity BEFORE INSERT ON person FOR EACH ROW EXECUTE FUNCTION pfm_person_identity();
UPDATE person SET identity_code = 'PFM-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)) WHERE identity_code IS NULL;
ALTER TABLE person ALTER COLUMN identity_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS person_identity_code ON person(identity_code);
ALTER TABLE person DROP CONSTRAINT IF EXISTS person_identity_code_check;
ALTER TABLE person ADD CONSTRAINT person_identity_code_check CHECK (identity_code ~ '^PFM-[0-9A-F]{10}$');

CREATE TABLE IF NOT EXISTS classification_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES person(id),
  classification text NOT NULL CHECK (classification IN ('PF1', 'PF2')),
  decided_on date NOT NULL,
  valid_until date,
  -- The federation that classified (the classifier body), on the platform.
  federation_id uuid NOT NULL REFERENCES organization(id),
  classifier text NOT NULL DEFAULT '' CHECK (length(classifier) <= 160),
  international boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('session', 'manual', 'dossier')),
  session_id uuid REFERENCES classification_session(id),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= decided_on)
);
CREATE INDEX IF NOT EXISTS classification_record_person ON classification_record(person_id, decided_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS classification_record_federation ON classification_record(federation_id, decided_on DESC);

-- The dossier knows the person, and the sheet opened in the receiving club.
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES person(id);
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS identity_code text NOT NULL DEFAULT '';
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS arrival_profile_id uuid REFERENCES club_person(id);
UPDATE international_transfer i SET person_id = cp.person_id, identity_code = pe.identity_code FROM club_person cp JOIN person pe ON pe.id = cp.person_id WHERE cp.id = i.profile_id AND i.person_id IS NULL;
