-- Wave 15 (C2): a grant file. The funder (ADEPS, COCOF...) with its website,
-- general email and phone, apart from the yearly application; the explanation
-- and conditions of the programme, the end of the period covered, the date to
-- check again next year and the link to the previous year's application; the
-- equipment it financed. The check-list uses funding_task (C1).

CREATE TABLE grant_funder (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 website text NOT NULL DEFAULT '' CHECK(length(website)<=300),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=200),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=300),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 contact_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 UNIQUE(id,organization_id),
 FOREIGN KEY(contact_id,organization_id) REFERENCES contact(id,organization_id)
);
CREATE UNIQUE INDEX grant_funder_name ON grant_funder(organization_id,lower(trim(name)));

ALTER TABLE grant_application ADD COLUMN funder_id uuid;
ALTER TABLE grant_application ADD FOREIGN KEY(funder_id,organization_id) REFERENCES grant_funder(id,organization_id);
ALTER TABLE grant_application ADD COLUMN program_url text NOT NULL DEFAULT '' CHECK(length(program_url)<=500);
ALTER TABLE grant_application ADD COLUMN conditions text NOT NULL DEFAULT '' CHECK(length(conditions)<=4000);
ALTER TABLE grant_application ADD COLUMN explanation text NOT NULL DEFAULT '' CHECK(length(explanation)<=4000);
ALTER TABLE grant_application ADD COLUMN ends_on date;
ALTER TABLE grant_application ADD COLUMN recheck_on date;
ALTER TABLE grant_application ADD COLUMN previous_id uuid;
ALTER TABLE grant_application ADD FOREIGN KEY(previous_id,organization_id) REFERENCES grant_application(id,organization_id);
CREATE INDEX grant_application_funder ON grant_application(funder_id) WHERE funder_id IS NOT NULL;

-- One funder per distinct name already written in the files.
INSERT INTO grant_funder(organization_id,name)
  SELECT DISTINCT ON (organization_id,lower(trim(funder))) organization_id,trim(funder) FROM grant_application ORDER BY organization_id,lower(trim(funder)),created_at;
UPDATE grant_application g SET funder_id=f.id FROM grant_funder f WHERE f.organization_id=g.organization_id AND lower(trim(f.name))=lower(trim(g.funder));

-- Equipment financed by a grant (for the report to the funder).
ALTER TABLE equipment_chair ADD COLUMN grant_id uuid;
ALTER TABLE equipment_chair ADD FOREIGN KEY(grant_id,organization_id) REFERENCES grant_application(id,organization_id);
ALTER TABLE equipment_chair ADD COLUMN purchase_value_cents integer CHECK(purchase_value_cents IS NULL OR purchase_value_cents BETWEEN 0 AND 100000000);
