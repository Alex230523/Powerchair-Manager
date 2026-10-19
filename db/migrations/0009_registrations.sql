CREATE TABLE registration_form (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 season_id uuid NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
 fields jsonb NOT NULL DEFAULT '[]', published boolean NOT NULL DEFAULT false,
 capacity integer CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 10000), version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id), UNIQUE(id,organization_id)
);
CREATE TABLE registration_application (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,form_id uuid NOT NULL,
 applicant_user_id text NOT NULL REFERENCES "user"(id), season_id uuid NOT NULL,
 subject_kind text NOT NULL DEFAULT 'represented' CHECK(subject_kind IN ('self','represented')),
 subject_name text NOT NULL,birth_date date NOT NULL CHECK(birth_date<=CURRENT_DATE),
 locale text NOT NULL CHECK(locale IN ('fr','nl')), answers jsonb NOT NULL DEFAULT '{}',
 form_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','incomplete','review','accepted','waiting','refused','withdrawn')),
 profile_id uuid, prior_application_id uuid REFERENCES registration_application(id),
 version integer NOT NULL DEFAULT 1,submitted_at timestamptz,decided_at timestamptz,decided_by text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(form_id,organization_id) REFERENCES registration_form(id,organization_id),
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id),UNIQUE(id,organization_id),
 UNIQUE(form_id,applicant_user_id,subject_name,birth_date)
);
CREATE UNIQUE INDEX registration_one_admission ON registration_application(organization_id,season_id,profile_id) WHERE status='accepted';
CREATE INDEX registration_inbox ON registration_application(organization_id,status,updated_at DESC);
CREATE TABLE registration_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES registration_application(id),
 actor_id text NOT NULL REFERENCES "user"(id),status text NOT NULL,message text NOT NULL DEFAULT '',internal boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE registration_attachment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_id uuid NOT NULL REFERENCES registration_application(id),
 field_key text NOT NULL,filename text NOT NULL,media_type text NOT NULL,content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 2097152),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(application_id,field_key)
);
CREATE TABLE registration_followup (
 application_id uuid NOT NULL REFERENCES registration_application(id),kind text NOT NULL CHECK(kind IN ('documents','dues')),
 state text NOT NULL DEFAULT 'awaiting_module' CHECK(state IN ('awaiting_module','processed')),PRIMARY KEY(application_id,kind)
);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage']::text[]);
ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration'));
CREATE TABLE registration_rate (
 user_id text PRIMARY KEY REFERENCES "user"(id),window_started timestamptz NOT NULL DEFAULT now(),count integer NOT NULL DEFAULT 1
);
