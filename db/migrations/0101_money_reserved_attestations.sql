-- 9: money. Reserved funds (the accounting « fonds affectés »), mutual
-- insurance attestations as signed PDF sent once, fundraising links, goals
-- per person and yearly reminders on grants and sponsors. Additive and
-- idempotent.

-- Part 1: an allocation of a grant, a sponsor, a gift or a pot. Its income
-- and its spending are the operations linked to it.
CREATE TABLE IF NOT EXISTS fund_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  source_kind text NOT NULL CHECK (source_kind IN ('grant', 'sponsor', 'donation', 'fundraising', 'other')),
  grant_id uuid,
  partner_id uuid,
  pot_id uuid REFERENCES fundraising_pot(id),
  source_label text NOT NULL DEFAULT '' CHECK (length(source_label) <= 160),
  purpose text NOT NULL CHECK (purpose IN ('equipment', 'salary', 'training', 'travel', 'other')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 160),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  use_by date,
  proof text NOT NULL DEFAULT '' CHECK (length(proof) <= 300),
  responsible_user_id text REFERENCES "user"(id),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (id, organization_id),
  FOREIGN KEY (grant_id, organization_id) REFERENCES grant_application(id, organization_id),
  FOREIGN KEY (partner_id, organization_id) REFERENCES partner(id, organization_id)
);
CREATE INDEX IF NOT EXISTS fund_allocation_org ON fund_allocation(organization_id) WHERE closed_at IS NULL;
ALTER TABLE finance_transaction ADD COLUMN IF NOT EXISTS allocation_id uuid REFERENCES fund_allocation(id);
CREATE INDEX IF NOT EXISTS finance_transaction_allocation ON finance_transaction(allocation_id) WHERE allocation_id IS NOT NULL;

-- Part 2: who signs, the signature (seen by the administrators only), the automatic sending.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS signatory_role text NOT NULL DEFAULT '' CHECK (length(signatory_role) <= 80);
ALTER TABLE organization ADD COLUMN IF NOT EXISTS attestation_auto boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS organization_signature (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 524288),
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One numbered attestation per person and season; every sending is kept.
CREATE TABLE IF NOT EXISTS dues_attestation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  season_id uuid NOT NULL,
  number integer NOT NULL CHECK (number > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, profile_id, season_id),
  UNIQUE (organization_id, number),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id)
);
CREATE TABLE IF NOT EXISTS dues_attestation_send (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id uuid NOT NULL REFERENCES dues_attestation(id),
  kind text NOT NULL CHECK (kind IN ('auto', 'manual')),
  recipient_user_id text NOT NULL REFERENCES "user"(id),
  sent_by text REFERENCES "user"(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);
-- Only one automatic sending per attestation and recipient.
CREATE UNIQUE INDEX IF NOT EXISTS dues_attestation_auto_once ON dues_attestation_send(attestation_id, recipient_user_id) WHERE kind = 'auto';
-- A mutual's own form: the member drops the blank one, the club returns it filled and signed.
CREATE TABLE IF NOT EXISTS mutual_form (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  season_id uuid NOT NULL,
  blank_name text NOT NULL CHECK (length(trim(blank_name)) BETWEEN 1 AND 200),
  blank_type text NOT NULL CHECK (blank_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  blank bytea NOT NULL CHECK (octet_length(blank) BETWEEN 1 AND 5242880),
  filled_name text CHECK (filled_name IS NULL OR length(trim(filled_name)) BETWEEN 1 AND 200),
  filled_type text CHECK (filled_type IS NULL OR filled_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  filled bytea CHECK (filled IS NULL OR octet_length(filled) BETWEEN 1 AND 5242880),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_by text REFERENCES "user"(id),
  done_at timestamptz,
  CHECK ((done_at IS NULL) = (filled IS NULL)),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id)
);
CREATE INDEX IF NOT EXISTS mutual_form_todo ON mutual_form(organization_id) WHERE done_at IS NULL;

-- Part 3: a fundraising action's web link, and a goal per person.
ALTER TABLE fundraising_pot ADD COLUMN IF NOT EXISTS link_url text NOT NULL DEFAULT '' CHECK (length(link_url) <= 500 AND (link_url = '' OR link_url ~ '^https?://'));
CREATE TABLE IF NOT EXISTS fundraising_goal (
  pot_id uuid NOT NULL REFERENCES fundraising_pot(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  target integer NOT NULL CHECK (target BETWEEN 1 AND 100000),
  unit text NOT NULL DEFAULT '' CHECK (length(unit) <= 60),
  done integer NOT NULL DEFAULT 0 CHECK (done BETWEEN 0 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pot_id, profile_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
