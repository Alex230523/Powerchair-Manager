-- Club identity: one logo per organisation (small image, served to members and on public forms).
CREATE TABLE organization_logo (
 organization_id uuid PRIMARY KEY REFERENCES organization(id),
 media_type text NOT NULL CHECK(media_type IN ('image/png','image/jpeg','image/webp')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 524288),
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Club finance ledger (cahier des charges: FinancialTransaction). Manual entries today;
-- lot 09 will add imported bank movements with source='bank'. Amounts are positive cents,
-- the direction says whether money came in or went out. Entries are cancelled, never deleted.
CREATE TABLE finance_transaction (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 occurred_on date NOT NULL, label text NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 160),
 direction text NOT NULL CHECK(direction IN ('in','out')),
 category text NOT NULL CHECK(category IN ('dues','subsidy','sponsor','donation','event','equipment','venue','travel','competition','insurance','other')),
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
 method text NOT NULL DEFAULT 'transfer' CHECK(method IN ('transfer','cash','card','other')),
 counterparty text NOT NULL DEFAULT '' CHECK(length(counterparty)<=160),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=160),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','bank')),
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz, cancelled_by text REFERENCES "user"(id), cancel_reason text NOT NULL DEFAULT '',
 CHECK(cancelled_at IS NULL OR length(trim(cancel_reason))>=5)
);
CREATE INDEX finance_ledger ON finance_transaction(organization_id,occurred_on DESC);

-- Coach education: the federation publishes courses; a club president requests one for a coach;
-- the federation president approves or refuses. An approved request is the coach's certificate.
CREATE TABLE training_course (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), federation_id uuid NOT NULL REFERENCES organization(id),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 120),
 level text NOT NULL DEFAULT '' CHECK(length(level)<=60),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 hours numeric(5,1) CHECK(hours IS NULL OR hours BETWEEN 0 AND 1000),
 validity_years integer CHECK(validity_years IS NULL OR validity_years BETWEEN 1 AND 20),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX training_course_title ON training_course(federation_id,lower(trim(title)));
CREATE TABLE training_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, profile_id uuid NOT NULL,
 course_id uuid NOT NULL REFERENCES training_course(id),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','refused','cancelled')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 requested_by text NOT NULL REFERENCES "user"(id), requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by text REFERENCES "user"(id), decided_at timestamptz,
 decision_note text NOT NULL DEFAULT '' CHECK(length(decision_note)<=1000),
 completed_on date, valid_until date,
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id)
);
CREATE UNIQUE INDEX training_one_open_request ON training_request(profile_id,course_id) WHERE status='requested';
CREATE INDEX training_request_course ON training_request(course_id,status);
