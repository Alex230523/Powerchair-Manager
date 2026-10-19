-- Federation licences, requested by the club for a season and issued by the federation.
CREATE TABLE license (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), federation_id uuid NOT NULL REFERENCES organization(id),
 organization_id uuid NOT NULL, profile_id uuid NOT NULL,
 season text NOT NULL CHECK(season ~ '^[0-9]{4}-[0-9]{2}$'),
 number text, status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','active','refused','suspended')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 requested_by text NOT NULL REFERENCES "user"(id), requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by text REFERENCES "user"(id), decided_at timestamptz,
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id),
 CHECK(status<>'active' OR number IS NOT NULL)
);
CREATE UNIQUE INDEX license_one_per_season ON license(profile_id,season) WHERE status IN ('requested','active','suspended');
CREATE UNIQUE INDEX license_number ON license(federation_id,number) WHERE number IS NOT NULL;

-- Sport classification checked by the federation (the club proposes, the federation validates).
ALTER TABLE player_sport_profile ADD COLUMN classification_status text NOT NULL DEFAULT 'unverified'
  CHECK(classification_status IN ('unverified','requested','validated','refused'));
ALTER TABLE player_sport_profile ADD COLUMN classification_note text NOT NULL DEFAULT '' CHECK(length(classification_note)<=500);
ALTER TABLE player_sport_profile ADD COLUMN classification_checked_by text REFERENCES "user"(id);
ALTER TABLE player_sport_profile ADD COLUMN classification_checked_at timestamptz;

-- Registration without a password: a link sent by email opens the applicant space for one form.
CREATE TABLE registration_guest_link (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id),
 form_id uuid NOT NULL REFERENCES registration_form(id), token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 last_used_at timestamptz
);
CREATE INDEX registration_guest_recent ON registration_guest_link(user_id,created_at DESC);

-- Electronic signature of a document generated from a club template.
CREATE TABLE document_signature (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 document_id uuid NOT NULL REFERENCES club_document(id),
 source_version_id uuid NOT NULL REFERENCES document_version(id),
 signed_version_id uuid NOT NULL REFERENCES document_version(id),
 signer_user_id text NOT NULL REFERENCES "user"(id), signer_name text NOT NULL CHECK(length(trim(signer_name)) BETWEEN 2 AND 120),
 text_sha256 text NOT NULL, signature_png bytea NOT NULL CHECK(octet_length(signature_png) BETWEEN 1 AND 204800),
 signed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update','attendance_update','dues_reminder','document_reminder','training_update','match_update','registration_link','license_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license'));
