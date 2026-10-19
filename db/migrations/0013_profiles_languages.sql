ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_id_user_unique UNIQUE(id,user_id);
CREATE TABLE user_profile (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES "user"(id),mandate_id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),is_default boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(mandate_id,user_id) REFERENCES role_assignment(id,user_id),UNIQUE(user_id,mandate_id)
);
CREATE UNIQUE INDEX user_profile_name ON user_profile(user_id,lower(trim(name)));
CREATE UNIQUE INDEX user_profile_default ON user_profile(user_id) WHERE is_default;
ALTER TABLE person DROP CONSTRAINT person_locale_check;
ALTER TABLE person ADD CONSTRAINT person_locale_check CHECK(locale IN ('fr','nl','en'));
ALTER TABLE notification_template DROP CONSTRAINT notification_template_locale_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_locale_check CHECK(locale IN ('fr','nl','en'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_locale_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_locale_check CHECK(locale IN ('fr','nl','en'));
ALTER TABLE registration_application DROP CONSTRAINT registration_application_locale_check;
ALTER TABLE registration_application ADD CONSTRAINT registration_application_locale_check CHECK(locale IN ('fr','nl','en'));
ALTER TABLE document_template DROP CONSTRAINT document_template_locale_check;
ALTER TABLE document_template ADD CONSTRAINT document_template_locale_check CHECK(locale IN ('fr','nl','en'));
