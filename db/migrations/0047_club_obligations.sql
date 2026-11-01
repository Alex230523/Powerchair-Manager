-- Wave 16 (A): the club's status. One line per obligation and per year
-- (past years stay for the history): affiliations paid, insurance renewed,
-- general assembly held, accounts approved and filed, UBO register... The
-- list is proposed from the club's legal form (organization.legal_form, 0046)
-- and stays fully editable. Two lines may tick themselves from the annual
-- accounts (auto_source): approved by the assembly, filed.
-- proof_url: a link to the proof (the club's drive, the registry receipt).
CREATE TABLE club_obligation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
 template_key text NOT NULL DEFAULT '' CHECK (length(template_key) <= 40),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
 periodicity text NOT NULL DEFAULT 'annual' CHECK (periodicity IN ('annual', 'once')),
 due_on date,
 done_on date,
 proof_url text NOT NULL DEFAULT '' CHECK (proof_url = '' OR (proof_url ~ '^https://' AND length(proof_url) <= 500)),
 responsible_profile_id uuid,
 auto_source text NOT NULL DEFAULT 'none' CHECK (auto_source IN ('none', 'accounts_approved', 'accounts_filed')),
 position integer NOT NULL DEFAULT 0,
 archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, organization_id),
 FOREIGN KEY (responsible_profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX club_obligation_year ON club_obligation(organization_id, year) WHERE NOT archived;
CREATE UNIQUE INDEX club_obligation_template ON club_obligation(organization_id, year, template_key) WHERE template_key <> '' AND NOT archived;
