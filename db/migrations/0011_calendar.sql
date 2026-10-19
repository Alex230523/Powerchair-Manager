CREATE TABLE calendar_place (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),name text NOT NULL,address text NOT NULL DEFAULT '',contact text NOT NULL DEFAULT '',
 capacity integer CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 100000),cost_cents integer NOT NULL DEFAULT 0 CHECK(cost_cents BETWEEN 0 AND 100000000),
 accessible boolean NOT NULL DEFAULT false,toilets boolean NOT NULL DEFAULT false,parking boolean NOT NULL DEFAULT false,storage boolean NOT NULL DEFAULT false,charging boolean NOT NULL DEFAULT false,
 logistics text NOT NULL DEFAULT '',archived boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX calendar_place_name ON calendar_place(organization_id,lower(trim(name)));
CREATE TABLE calendar_series (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),interval_days integer NOT NULL CHECK(interval_days IN (0,1,7,14)),occurrences integer NOT NULL CHECK(occurrences BETWEEN 1 AND 52),created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,organization_id)
);
CREATE TABLE calendar_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),series_id uuid NOT NULL,ordinal integer NOT NULL,
 title text NOT NULL,kind text NOT NULL CHECK(kind IN ('training','friendly','meeting','tournament','camp','association','custom')),
 custom_type text NOT NULL DEFAULT '',timezone text NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,local_start text NOT NULL,local_end text NOT NULL,
 team_id uuid,place_id uuid,responsible_user_id text NOT NULL REFERENCES "user"(id),visibility text NOT NULL CHECK(visibility IN ('organization','team','participants','staff')),
 equipment text NOT NULL DEFAULT '',instructions text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
 is_exception boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(series_id,organization_id) REFERENCES calendar_series(id,organization_id),FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id),FOREIGN KEY(place_id,organization_id) REFERENCES calendar_place(id,organization_id),
 CHECK(ends_at>starts_at),CHECK(ends_at-starts_at<=interval '7 days'),CHECK(visibility<>'team' OR team_id IS NOT NULL),UNIQUE(series_id,ordinal),UNIQUE(id,organization_id)
);
CREATE INDEX calendar_range ON calendar_event(organization_id,starts_at,ends_at);
CREATE INDEX calendar_place_range ON calendar_event(place_id,starts_at,ends_at) WHERE status='scheduled';
CREATE TABLE calendar_participant (
 event_id uuid NOT NULL,organization_id uuid NOT NULL,profile_id uuid NOT NULL,
 PRIMARY KEY(event_id,profile_id),FOREIGN KEY(event_id,organization_id) REFERENCES calendar_event(id,organization_id),FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id)
);
CREATE TABLE calendar_document (
 event_id uuid NOT NULL,organization_id uuid NOT NULL,document_id uuid NOT NULL,
 PRIMARY KEY(event_id,document_id),FOREIGN KEY(event_id,organization_id) REFERENCES calendar_event(id,organization_id),FOREIGN KEY(document_id,organization_id) REFERENCES club_document(id,organization_id)
);
CREATE TABLE calendar_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES calendar_event(id),actor_id text NOT NULL REFERENCES "user"(id),action text NOT NULL,
 before_data jsonb,after_data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE calendar_feed (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,user_id text NOT NULL,mandate_id uuid NOT NULL REFERENCES role_assignment(id),
 token_hash text NOT NULL UNIQUE,name text NOT NULL,team_id uuid,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '1 year',revoked_at timestamptz,
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_membership(organization_id,user_id),FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id)
);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read']::text[]);
ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar'));
