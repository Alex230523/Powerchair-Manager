-- 04/11/2026 (points 6 to 11, règlement BPCF 2025): the training format of a
-- club, the kind of a transfer and its force majeure, the proof that the
-- training compensation was paid, the federation's fines, and the
-- international transfers the federation records. Additive and idempotent.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS training_format text NOT NULL DEFAULT ''
  CHECK (training_format IN ('', 'academy', 'elite', 'elite_certified'));

ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS kind text CHECK (kind IS NULL OR kind IN ('consented', 'free', 'force_majeure'));
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS force_majeure boolean NOT NULL DEFAULT false;
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS force_majeure_reason text NOT NULL DEFAULT '' CHECK (length(force_majeure_reason) <= 1000);
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS payment_proof_filename text;
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS payment_proof_type text;
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS payment_proof bytea;
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;
ALTER TABLE transfer_offer ADD COLUMN IF NOT EXISTS payment_confirmed_by text REFERENCES "user"(id);

CREATE TABLE IF NOT EXISTS federation_fine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  club_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('late', 'forfeit', 'forfeit_day', 'other')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000),
  issued_on date NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  paid_on date,
  cancelled_at timestamptz,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (club_id <> federation_id)
);
CREATE INDEX IF NOT EXISTS federation_fine_club ON federation_fine(club_id, issued_on DESC);
CREATE INDEX IF NOT EXISTS federation_fine_federation ON federation_fine(federation_id, issued_on DESC);

CREATE TABLE IF NOT EXISTS international_transfer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  club_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  full_name text NOT NULL,
  foreign_club text NOT NULL CHECK (length(trim(foreign_club)) BETWEEN 2 AND 160),
  country text NOT NULL CHECK (length(trim(country)) BETWEEN 2 AND 80),
  training_years integer NOT NULL CHECK (training_years BETWEEN 1 AND 30),
  training_format text NOT NULL CHECK (training_format IN ('academy', 'elite', 'elite_certified')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 10000000),
  paid_on date,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, club_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS international_transfer_federation ON international_transfer(federation_id, created_at DESC);

-- Point 9: a second reminder a week before a due's deadline.
ALTER TABLE affiliation_due ADD COLUMN IF NOT EXISTS reminded_soon_at timestamptz;
