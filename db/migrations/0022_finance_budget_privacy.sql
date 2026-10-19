-- A ledger line can pay a dues receivable (recorded by hand now, by the bank module with lot 09).
ALTER TABLE finance_transaction ADD COLUMN receivable_id uuid REFERENCES dues_receivable(id);
CREATE INDEX finance_receivable ON finance_transaction(receivable_id) WHERE receivable_id IS NOT NULL AND cancelled_at IS NULL;

-- Receipts (invoice, ticket) attached to a ledger line.
CREATE TABLE finance_receipt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 transaction_id uuid NOT NULL REFERENCES finance_transaction(id),
 filename text NOT NULL CHECK(length(trim(filename)) BETWEEN 1 AND 200),
 media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 5242880),
 uploaded_by text NOT NULL REFERENCES "user"(id), uploaded_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz
);
CREATE INDEX finance_receipt_transaction ON finance_receipt(transaction_id) WHERE removed_at IS NULL;

-- Season budget per category and direction ("2026-27" seasons, 1 July to 30 June).
CREATE TABLE finance_budget (
 organization_id uuid NOT NULL REFERENCES organization(id), season text NOT NULL CHECK(season ~ '^[0-9]{4}-[0-9]{2}$'),
 direction text NOT NULL CHECK(direction IN ('in','out')), category text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 0 AND 100000000),
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id, season, direction, category)
);

-- Duplicate profiles merged into another one, and anonymised profiles (GDPR).
ALTER TABLE club_person ADD COLUMN merged_into uuid REFERENCES club_person(id);
ALTER TABLE club_person ADD COLUMN anonymized_at timestamptz;

-- Retention rules of each club and the log of privacy actions (export, anonymisation, purge).
CREATE TABLE privacy_setting (
 organization_id uuid PRIMARY KEY REFERENCES organization(id),
 former_member_years integer NOT NULL DEFAULT 5 CHECK(former_member_years BETWEEN 1 AND 30),
 refused_application_months integer NOT NULL DEFAULT 12 CHECK(refused_application_months BETWEEN 1 AND 120),
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE privacy_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 action text NOT NULL CHECK(action IN ('export','anonymize','merge','purge_applications')),
 target_id uuid, count integer NOT NULL DEFAULT 1, actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
