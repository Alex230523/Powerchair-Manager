-- Wave 15 (C1): each club defines its sponsorship packages and their conditions;
-- a partner chooses a package, with its signing, payment and renewal dates; one
-- task list serves partners (conditions to deliver) and grants (C2, check-list).

CREATE TABLE partner_package (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 season_id uuid,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
 amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents BETWEEN 0 AND 100000000),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 places integer CHECK(places IS NULL OR places BETWEEN 1 AND 1000),
 featured boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 0,
 archived boolean NOT NULL DEFAULT false,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 UNIQUE(id,organization_id),
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id)
);
CREATE INDEX partner_package_org ON partner_package(organization_id,archived,position);

CREATE TABLE partner_package_condition (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 package_id uuid NOT NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 160),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 quantity text NOT NULL DEFAULT '' CHECK(length(quantity)<=80),
 offset_days integer CHECK(offset_days IS NULL OR offset_days BETWEEN 0 AND 730),
 position integer NOT NULL DEFAULT 0,
 UNIQUE(id,organization_id),
 FOREIGN KEY(package_id,organization_id) REFERENCES partner_package(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX partner_package_condition_package ON partner_package_condition(package_id,position);

-- The partner's package and dates; the ledger line of the payment, written once.
ALTER TABLE partner ADD CONSTRAINT partner_id_organization UNIQUE(id,organization_id);
ALTER TABLE partner ADD COLUMN package_id uuid;
ALTER TABLE partner ADD FOREIGN KEY(package_id,organization_id) REFERENCES partner_package(id,organization_id);
ALTER TABLE partner ADD COLUMN signed_on date;
ALTER TABLE partner ADD COLUMN payment_due_on date;
ALTER TABLE partner ADD COLUMN paid_on date;
ALTER TABLE partner ADD COLUMN renewal_on date;
ALTER TABLE partner ADD COLUMN payment_transaction_id uuid REFERENCES finance_transaction(id);
-- Public report of the delivered conditions (no account needed), off until asked.
ALTER TABLE partner ADD COLUMN report_token text UNIQUE;
ALTER TABLE grant_application ADD CONSTRAINT grant_application_id_organization UNIQUE(id,organization_id);

-- Tasks of a partner (one per condition, plus free tasks) or of a grant (C2).
CREATE TABLE funding_task (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 partner_id uuid, grant_id uuid,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 200),
 detail text NOT NULL DEFAULT '' CHECK(length(detail)<=2000),
 due_on date,
 responsible_id uuid,
 status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','done')),
 done_on date,
 proof_url text NOT NULL DEFAULT '' CHECK(length(proof_url)<=500),
 position integer NOT NULL DEFAULT 0,
 origin text NOT NULL DEFAULT 'manual' CHECK(origin IN ('condition','manual','template')),
 condition_id uuid REFERENCES partner_package_condition(id) ON DELETE SET NULL,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((partner_id IS NULL) <> (grant_id IS NULL)),
 CHECK(status='todo' OR done_on IS NOT NULL),
 UNIQUE(id,organization_id),
 FOREIGN KEY(partner_id,organization_id) REFERENCES partner(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(grant_id,organization_id) REFERENCES grant_application(id,organization_id) ON DELETE CASCADE,
 FOREIGN KEY(responsible_id,organization_id) REFERENCES club_person(id,organization_id)
);
CREATE INDEX funding_task_partner ON funding_task(partner_id,position) WHERE partner_id IS NOT NULL;
CREATE INDEX funding_task_grant ON funding_task(grant_id,position) WHERE grant_id IS NOT NULL;
CREATE INDEX funding_task_due ON funding_task(organization_id,status,due_on);

-- A proof file for a task (photo of the jersey, screenshot of a post), like a receipt.
CREATE TABLE funding_task_proof (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 task_id uuid NOT NULL,
 filename text NOT NULL CHECK(length(trim(filename)) BETWEEN 1 AND 200),
 media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 5242880),
 uploaded_by text NOT NULL REFERENCES "user"(id), uploaded_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz,
 FOREIGN KEY(task_id,organization_id) REFERENCES funding_task(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX funding_task_proof_task ON funding_task_proof(task_id) WHERE removed_at IS NULL;

-- The club's bank account, printed on the sponsorship agreement.
ALTER TABLE organization ADD COLUMN iban text NOT NULL DEFAULT '' CHECK(length(iban)<=34);

-- A private calendar feed of a person with money rights may carry the money deadlines.
ALTER TABLE calendar_feed ADD COLUMN include_money boolean NOT NULL DEFAULT false;

-- Reminder to the person in charge of a task (resource "funding").
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK (resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license','newsletter','event_mail','funding'));
ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update','attendance_update','dues_reminder','document_reminder','training_update','match_update','registration_link','license_update','funding_task'));
