-- Registration answers marked confidential (pathology, national register number) are
-- encrypted at rest; only the clear part stays in the answers column.
ALTER TABLE registration_application ADD COLUMN confidential_answers text;

-- Kit size collected at registration.
ALTER TABLE player_sport_profile ADD COLUMN jersey_size text NOT NULL DEFAULT '' CHECK(length(jersey_size)<=20);

-- Club affiliation (in Belgium: one federation, the BPCF).
ALTER TABLE organization ADD COLUMN federation_id uuid REFERENCES organization(id);
ALTER TABLE organization ADD CONSTRAINT organization_federation_check CHECK(federation_id IS NULL OR (kind='club' AND federation_id<>id));
CREATE INDEX organization_federation ON organization(federation_id) WHERE federation_id IS NOT NULL;

-- Reminders sent for dues and documents (who, when, how many recipients).
CREATE TABLE reminder_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 profile_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('dues','documents')),
 recipients integer NOT NULL CHECK(recipients>=0), sent_by text NOT NULL REFERENCES "user"(id), sent_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id)
);
CREATE INDEX reminder_recent ON reminder_log(organization_id,kind,sent_at DESC);

ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update','attendance_update','dues_reminder','document_reminder','training_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training'));
