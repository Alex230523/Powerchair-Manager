-- Email verification was removed by explicit user decision; do not mark unverified addresses as verified.
UPDATE mail_job SET state='cancelled',error_code='EMAIL_VERIFICATION_DISABLED',completed_at=now() WHERE kind='auth_verify' AND state IN ('pending','failed','uncertain');
CREATE TABLE document_rule (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),season_id uuid NOT NULL,
 name text NOT NULL,category text NOT NULL CHECK(category IN ('identity','registration','licence','insurance','fitness','consent','training','contract','accounting')),
 role text NOT NULL DEFAULT 'any' CHECK(role IN ('any','player','coach','assistant','volunteer')),min_age integer NOT NULL DEFAULT 0 CHECK(min_age BETWEEN 0 AND 120),max_age integer NOT NULL DEFAULT 120 CHECK(max_age BETWEEN 0 AND 120),
 sensitive boolean NOT NULL DEFAULT false,required boolean NOT NULL DEFAULT true,active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id),CHECK(max_age>=min_age),CHECK(category<>'fitness' OR sensitive),UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX document_rule_unique ON document_rule(organization_id,season_id,lower(trim(name)),role,min_age,max_age);
CREATE TABLE club_document (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),profile_id uuid,season_id uuid NOT NULL,
 name text NOT NULL,category text NOT NULL,sensitive boolean NOT NULL DEFAULT false,rule_id uuid,
 status text NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','requested','uploaded','review','valid','refused','expired','archived')),
 version integer NOT NULL DEFAULT 1,current_version_id uuid,expires_on date,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id),FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id),FOREIGN KEY(rule_id,organization_id) REFERENCES document_rule(id,organization_id),
 CHECK(category IN ('identity','registration','licence','insurance','fitness','consent','training','contract','accounting')),CHECK(category<>'fitness' OR sensitive),UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX document_rule_slot ON club_document(profile_id,rule_id) WHERE rule_id IS NOT NULL;
CREATE TABLE document_template (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),name text NOT NULL,locale text NOT NULL CHECK(locale IN ('fr','nl')),version integer NOT NULL,
 body text NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,name,locale,version)
);
CREATE TABLE document_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES club_document(id),sequence integer NOT NULL,
 filename text NOT NULL,media_type text NOT NULL,content_ciphertext text NOT NULL,sha256 text NOT NULL,
 uploaded_by text NOT NULL REFERENCES "user"(id),uploaded_at timestamptz NOT NULL DEFAULT now(),reviewed_by text REFERENCES "user"(id),reviewed_at timestamptz,verdict text,expires_on date,
 template_id uuid REFERENCES document_template(id),registration_attachment_id uuid REFERENCES registration_attachment(id),UNIQUE(document_id,sequence),UNIQUE(id,document_id)
);
ALTER TABLE club_document ADD FOREIGN KEY(current_version_id,id) REFERENCES document_version(id,document_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE document_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES club_document(id),actor_id text REFERENCES "user"(id),action text NOT NULL,message text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_share (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES club_document(id),version_id uuid NOT NULL REFERENCES document_version(id),
 federation_id uuid NOT NULL REFERENCES organization(id),expires_on date NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz
);
CREATE UNIQUE INDEX document_share_unique ON document_share(document_id,version_id,federation_id) WHERE revoked_at IS NULL;
CREATE TABLE document_task (
 document_id uuid PRIMARY KEY REFERENCES club_document(id),kind text NOT NULL DEFAULT 'missing' CHECK(kind IN ('missing','review','expired')),state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz
);
CREATE INDEX document_library ON club_document(organization_id,status,season_id);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive']::text[]);
ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration','document'));
