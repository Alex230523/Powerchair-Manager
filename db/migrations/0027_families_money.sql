-- Wave 8: sibling discount on dues, fundraising groups and pots, absences
-- announced in advance, season rollover traces and the fundraising module.

ALTER TABLE organization DROP CONSTRAINT organization_disabled_modules_check;
ALTER TABLE organization ADD CONSTRAINT organization_disabled_modules_check
  CHECK (disabled_modules <@ ARRAY['finance','dues','equipment','matches','licenses','reminders','messages','statistics','trips','fundraising']::text[]);

-- Sibling discount, set per dues plan: the eldest pays the full amount, the
-- second and the following ones get these percentages off.
ALTER TABLE dues_plan
  ADD COLUMN sibling_second_percent integer NOT NULL DEFAULT 0 CHECK (sibling_second_percent BETWEEN 0 AND 100),
  ADD COLUMN sibling_next_percent integer NOT NULL DEFAULT 0 CHECK (sibling_next_percent BETWEEN 0 AND 100);
-- Set when the discount comes from the sibling rule (so it can be recomputed).
ALTER TABLE dues_receivable ADD COLUMN sibling_rank integer CHECK (sibling_rank IS NULL OR sibling_rank >= 1);

-- Fundraising lives apart from the club accounts: a group (support committee,
-- a project) holds pots with a goal; noting a gift here writes nothing in the ledger.
CREATE TABLE fundraising_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  archived boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);
CREATE TABLE fundraising_pot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  group_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  goal_cents integer NOT NULL CHECK (goal_cents BETWEEN 100 AND 1000000000),
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  public_token text UNIQUE,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (group_id, organization_id) REFERENCES fundraising_group(id, organization_id)
);
CREATE TABLE fundraising_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id uuid NOT NULL REFERENCES fundraising_pot(id),
  occurred_on date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('donation','sponsor','action','subsidy','expense')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 160),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 1000000000),
  donor text NOT NULL DEFAULT '' CHECK (length(donor) <= 160),
  anonymous boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by text REFERENCES "user"(id)
);
CREATE INDEX fundraising_movement_pot ON fundraising_movement(pot_id, occurred_on);

-- Absence announced ahead (hospital stay, chair under repair): every session
-- in the period is answered "absent" with the reason, including future ones.
CREATE TABLE absence_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  reason text NOT NULL CHECK (reason IN ('illness','injury','chair','transport','school_work','family','other')),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
  declared_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX absence_period_profile ON absence_period(profile_id, starts_on, ends_on) WHERE cancelled_at IS NULL;
-- The reason of a single absence answer; cleared when the answer becomes "present".
ALTER TABLE attendance_invitation ADD COLUMN absence_reason text NOT NULL DEFAULT ''
  CHECK (absence_reason IN ('','illness','injury','chair','transport','school_work','family','other'));
ALTER TABLE attendance_invitation ADD COLUMN absence_period_id uuid REFERENCES absence_period(id);

-- Which season a new one was rolled over from.
ALTER TABLE season ADD COLUMN rolled_from uuid REFERENCES season(id);

-- Club identity for official papers (mutual insurance attestations).
ALTER TABLE organization
  ADD COLUMN address text NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  ADD COLUMN company_number text NOT NULL DEFAULT '' CHECK (company_number = '' OR company_number ~ '^[01][0-9]{3}\.[0-9]{3}\.[0-9]{3}$'),
  ADD COLUMN signatory text NOT NULL DEFAULT '' CHECK (length(signatory) <= 160);
