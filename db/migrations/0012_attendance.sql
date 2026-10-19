CREATE TABLE attendance_register (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id), event_id uuid NOT NULL UNIQUE,
 deadline timestamptz NOT NULL, minimum integer NOT NULL DEFAULT 0 CHECK(minimum BETWEEN 0 AND 100000),
 closed_at timestamptz, closed_by text REFERENCES "user"(id), version integer NOT NULL DEFAULT 1,
 reminder_sent_at timestamptz, alert_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(event_id,organization_id) REFERENCES calendar_event(id,organization_id), UNIQUE(id,organization_id)
);
CREATE TABLE attendance_invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id), register_id uuid NOT NULL,
 profile_id uuid NOT NULL, withdrawn_at timestamptz,
 response text NOT NULL DEFAULT 'none' CHECK(response IN ('none','present','absent','uncertain')),
 comment text NOT NULL DEFAULT '' CHECK(length(comment)<=1000), responded_at timestamptz, responded_by text REFERENCES "user"(id),
 actual text NOT NULL DEFAULT 'unchecked' CHECK(actual IN ('unchecked','present','absent','late','early')),
 marked_at timestamptz, marked_by text REFERENCES "user"(id), version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(register_id,organization_id) REFERENCES attendance_register(id,organization_id),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id), UNIQUE(register_id,profile_id)
);
CREATE TABLE attendance_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), register_id uuid NOT NULL REFERENCES attendance_register(id), invitation_id uuid REFERENCES attendance_invitation(id),
 actor_id text NOT NULL REFERENCES "user"(id), action text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage']::text[]);
ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update','attendance_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance'));
