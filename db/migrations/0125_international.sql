-- 05/11/2026 (international, step 1): countries, the country of each
-- organisation, the rulebook of each federation as data, and the dossier
-- of an international transfer shared between two federations of the
-- platform. Everything additive; Belgium and the BPCF scale by default.
CREATE TABLE IF NOT EXISTS country (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name_fr text NOT NULL,
  name_nl text NOT NULL,
  name_en text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  sort integer NOT NULL DEFAULT 100
);
INSERT INTO country(code, name_fr, name_nl, name_en, currency, sort) VALUES
  ('BE', 'Belgique', 'België', 'Belgium', 'EUR', 1),
  ('NL', 'Pays-Bas', 'Nederland', 'Netherlands', 'EUR', 2),
  ('FR', 'France', 'Frankrijk', 'France', 'EUR', 3),
  ('GB', 'Royaume-Uni', 'Verenigd Koninkrijk', 'United Kingdom', 'GBP', 4),
  ('DE', 'Allemagne', 'Duitsland', 'Germany', 'EUR', 5),
  ('LU', 'Luxembourg', 'Luxemburg', 'Luxembourg', 'EUR', 6),
  ('IE', 'Irlande', 'Ierland', 'Ireland', 'EUR', 7),
  ('ES', 'Espagne', 'Spanje', 'Spain', 'EUR', 8),
  ('IT', 'Italie', 'Italië', 'Italy', 'EUR', 9),
  ('PT', 'Portugal', 'Portugal', 'Portugal', 'EUR', 10),
  ('CH', 'Suisse', 'Zwitserland', 'Switzerland', 'CHF', 11),
  ('AT', 'Autriche', 'Oostenrijk', 'Austria', 'EUR', 12),
  ('DK', 'Danemark', 'Denemarken', 'Denmark', 'DKK', 13),
  ('US', 'États-Unis', 'Verenigde Staten', 'United States', 'USD', 20),
  ('CA', 'Canada', 'Canada', 'Canada', 'CAD', 21),
  ('AU', 'Australie', 'Australië', 'Australia', 'AUD', 22),
  ('JP', 'Japon', 'Japan', 'Japan', 'JPY', 23)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE organization ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'BE' REFERENCES country(code);
CREATE INDEX IF NOT EXISTS organization_country ON organization(country_code, kind);

-- The rulebook of a federation: the amounts the application offers (training
-- compensation, file fee, caps, fines). One row per federation, every change
-- kept; without a row the BPCF 2025 scale applies.
CREATE TABLE IF NOT EXISTS federation_policy (
  federation_id uuid PRIMARY KEY REFERENCES organization(id),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  policy jsonb NOT NULL,
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS federation_policy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  version integer NOT NULL,
  policy jsonb NOT NULL,
  changed_by text NOT NULL REFERENCES "user"(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS federation_policy_history_fed ON federation_policy_history(federation_id, version DESC);

-- An international transfer becomes a dossier: when the other federation is
-- on the platform it is sent to it, which accepts or refuses; the dossier
-- exposes the player's name, the training summary and the amount, nothing else.
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS to_federation_id uuid REFERENCES organization(id);
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'sent', 'accepted', 'refused'));
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT '';
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS decided_by text REFERENCES "user"(id);
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 1000);
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS to_club_id uuid REFERENCES organization(id);
ALTER TABLE international_transfer ADD COLUMN IF NOT EXISTS certificate text NOT NULL DEFAULT '' CHECK (length(certificate) <= 40);
CREATE INDEX IF NOT EXISTS international_transfer_to ON international_transfer(to_federation_id, status, created_at DESC) WHERE to_federation_id IS NOT NULL;
-- The certificate numbers, one sequence per receiving federation and year.
CREATE UNIQUE INDEX IF NOT EXISTS international_transfer_certificate ON international_transfer(to_federation_id, certificate) WHERE certificate <> '';
