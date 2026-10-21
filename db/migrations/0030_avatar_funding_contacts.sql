-- Wave 11: profile photo, dues settings and automatic reminders, grants,
-- partners (sponsors, donors, patrons) and the club's contact book.

-- One photo per account, shown at the bottom of the menu and in Mon espace.
CREATE TABLE user_avatar (
 user_id text PRIMARY KEY REFERENCES "user"(id),
 media_type text NOT NULL CHECK(media_type IN ('image/png','image/jpeg','image/webp')),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 262144),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dues settings of the club (automatic reminders), next to the presence rules.
ALTER TABLE organization ADD COLUMN dues_rules jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(dues_rules) = 'object');
-- Automatic reminders have no sender.
ALTER TABLE reminder_log ALTER COLUMN sent_by DROP NOT NULL;
ALTER TABLE reminder_log ADD COLUMN automatic boolean NOT NULL DEFAULT false;

-- Contact book: people outside the club the club deals with.
CREATE TABLE contact (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 120),
 organization_name text NOT NULL DEFAULT '' CHECK(length(organization_name)<=160),
 role text NOT NULL DEFAULT '' CHECK(length(role)<=120),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=200),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40),
 tags text[] NOT NULL DEFAULT '{}' CHECK(tags <@ ARRAY['sponsor','donor','public','federation','venue','press','supplier','medical','volunteer','other']::text[]),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 archived boolean NOT NULL DEFAULT false,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 UNIQUE(id,organization_id)
);
CREATE INDEX contact_org ON contact(organization_id,archived,full_name);

-- Grants (subsides): one row per application, from the idea to the payment and the report.
CREATE TABLE grant_application (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 season_id uuid, funder text NOT NULL CHECK(length(trim(funder)) BETWEEN 2 AND 160),
 program text NOT NULL DEFAULT '' CHECK(length(program)<=160),
 purpose text NOT NULL DEFAULT '' CHECK(length(purpose)<=2000),
 requested_cents integer NOT NULL DEFAULT 0 CHECK(requested_cents BETWEEN 0 AND 100000000),
 granted_cents integer CHECK(granted_cents BETWEEN 0 AND 100000000),
 status text NOT NULL DEFAULT 'idea' CHECK(status IN ('idea','submitted','granted','refused','paid','closed')),
 deadline_on date, submitted_on date, decision_on date, paid_on date, report_due_on date,
 contact_id uuid, notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id),
 FOREIGN KEY(contact_id,organization_id) REFERENCES contact(id,organization_id)
);
CREATE INDEX grant_org ON grant_application(organization_id,status);

-- Partners: sponsors, donors, patrons, foundations. Renewal and next step dates feed the home agenda.
CREATE TABLE partner (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 kind text NOT NULL CHECK(kind IN ('sponsor','donor','patron','foundation')),
 status text NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','active','ended')),
 amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents BETWEEN 0 AND 100000000),
 in_kind text NOT NULL DEFAULT '' CHECK(length(in_kind)<=400),
 counterpart text NOT NULL DEFAULT '' CHECK(length(counterpart)<=400),
 starts_on date, ends_on date, next_action_on date, next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=200),
 contact_id uuid, notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on),
 FOREIGN KEY(contact_id,organization_id) REFERENCES contact(id,organization_id)
);
CREATE INDEX partner_org ON partner(organization_id,status);
