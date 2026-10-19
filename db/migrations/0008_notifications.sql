CREATE TABLE notification_template (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),
 kind text NOT NULL CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self')),
 locale text NOT NULL CHECK(locale IN ('fr','nl')),version integer NOT NULL CHECK(version>0),
 subject text NOT NULL,body text NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,kind,locale,version)
);
CREATE TABLE notification_preference (
 organization_id uuid NOT NULL,user_id text NOT NULL,category text NOT NULL CHECK(category IN ('administrative','sport')),
 email_enabled boolean NOT NULL DEFAULT true,in_app_enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(organization_id,user_id,category),
 FOREIGN KEY(organization_id,user_id) REFERENCES organization_membership(organization_id,user_id)
);
CREATE TABLE notification_setting (
 organization_id uuid PRIMARY KEY REFERENCES organization(id),paused boolean NOT NULL DEFAULT false
);
CREATE TABLE notification_dispatch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organization(id),recipient_user_id text,
 dedupe_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mail_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dispatch_id uuid NOT NULL UNIQUE REFERENCES notification_dispatch(id),
 organization_id uuid REFERENCES organization(id),recipient_user_id text,kind text NOT NULL,
 category text NOT NULL CHECK(category IN ('security','administrative','sport')),
 resource_type text NOT NULL CHECK(resource_type IN ('auth','invitation','membership','team','family')),
 resource_id text NOT NULL,locale text NOT NULL CHECK(locale IN ('fr','nl')),
 template_id uuid REFERENCES notification_template(id),template_version integer NOT NULL,
 payload_ciphertext text NOT NULL,dedupe_key text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','local','sent','failed','cancelled','uncertain')),
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),
 transport_mode text,claim_token uuid,locked_until timestamptz,dispatch_started_at timestamptz,error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
CREATE INDEX mail_ready ON mail_job(available_at,created_at) WHERE state='pending';
CREATE TABLE mail_attempt (
 id uuid PRIMARY KEY,job_id uuid NOT NULL REFERENCES mail_job(id),started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,outcome text NOT NULL DEFAULT 'processing',error_code text
);
CREATE TABLE app_notification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dispatch_id uuid NOT NULL UNIQUE REFERENCES notification_dispatch(id),
 organization_id uuid NOT NULL,recipient_user_id text NOT NULL,kind text NOT NULL,category text NOT NULL,
 resource_type text NOT NULL,resource_id text NOT NULL,title text NOT NULL,body text NOT NULL,
 href text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,recipient_user_id) REFERENCES organization_membership(organization_id,user_id)
);
CREATE INDEX notification_inbox ON app_notification(organization_id,recipient_user_id,created_at DESC);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage']::text[]);
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage']::text[]);
