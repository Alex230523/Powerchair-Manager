-- Wave 15 (C12): the club's annual accounts (small ASBL, simplified
-- accounting), prepared from the ledger. The financial year may differ from
-- the season; ledger categories map to the rubrics of the legal schema; each
-- financial year has one live version (draft, verified, approved by the
-- general assembly, filed); an approved version is frozen, a correction
-- starts a new version.

ALTER TABLE organization ADD COLUMN fiscal_year_start text NOT NULL DEFAULT '01-01'
  CHECK (fiscal_year_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])$');

CREATE TABLE accounts_mapping (
 organization_id uuid NOT NULL REFERENCES organization(id),
 direction text NOT NULL CHECK(direction IN ('in','out')),
 category text NOT NULL CHECK(category IN ('dues','subsidy','sponsor','donation','event','equipment','venue','travel','competition','insurance','other')),
 rubric text NOT NULL CHECK(rubric IN ('dues','gifts','subsidies','goods_in','other_in','goods_out','wages','services','other_out')),
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,direction,category),
 CHECK((direction='in') = (rubric IN ('dues','gifts','subsidies','goods_in','other_in')))
);

CREATE TABLE annual_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 year_start date NOT NULL, year_end date NOT NULL CHECK(year_end>year_start),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verified','approved','filed')),
 manual jsonb NOT NULL DEFAULT '[]',
 commitments text NOT NULL DEFAULT '' CHECK(length(commitments)<=8000),
 verified_name text NOT NULL DEFAULT '' CHECK(length(verified_name)<=120),
 verified_on date,
 approved_on date,
 filed_on date,
 snapshot jsonb,
 previous_id uuid,
 superseded_at timestamptz,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 row_version integer NOT NULL DEFAULT 1,
 UNIQUE(id,organization_id),
 FOREIGN KEY(previous_id,organization_id) REFERENCES annual_accounts(id,organization_id),
 CHECK(status IN ('draft','verified') OR snapshot IS NOT NULL),
 CHECK(status<>'filed' OR filed_on IS NOT NULL),
 CHECK(status NOT IN ('approved','filed') OR approved_on IS NOT NULL)
);
CREATE UNIQUE INDEX annual_accounts_live ON annual_accounts(organization_id,year_start) WHERE superseded_at IS NULL;
