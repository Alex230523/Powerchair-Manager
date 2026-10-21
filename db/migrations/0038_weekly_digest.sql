-- Weekly digest by email (wave 15, C7).
-- The club's default day and time (Europe/Brussels): Wednesday 7:30.
-- Day 1 = Monday ... 7 = Sunday; time in minutes after midnight, 6:00 to 20:00 by half hours.
ALTER TABLE organization
  ADD COLUMN digest_day smallint NOT NULL DEFAULT 3 CHECK(digest_day BETWEEN 1 AND 7),
  ADD COLUMN digest_minute smallint NOT NULL DEFAULT 450 CHECK(digest_minute BETWEEN 360 AND 1200 AND digest_minute % 30 = 0);

-- Each person's choice lives in the existing notification preferences, category "digest":
-- email_enabled is "receive the weekly digest"; day and time NULL follow the club.
ALTER TABLE notification_preference DROP CONSTRAINT notification_preference_category_check;
ALTER TABLE notification_preference ADD CONSTRAINT notification_preference_category_check CHECK(category IN ('administrative','sport','digest'));
ALTER TABLE notification_preference
  ADD COLUMN digest_day smallint CHECK(digest_day BETWEEN 1 AND 7),
  ADD COLUMN digest_minute smallint CHECK(digest_minute BETWEEN 360 AND 1200 AND digest_minute % 30 = 0),
  ADD COLUMN digest_sections text[] CHECK(digest_sections <@ ARRAY['todos','events','registrations','documents','dues','readiness','deadlines','tasks','treasury']::text[]);

-- One digest per person, club and ISO week (empty weeks are recorded too, with no mail).
-- A preview asked from the settings is recorded apart and never blocks the week's digest.
CREATE TABLE digest_send (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  week text NOT NULL CHECK(week ~ '^[0-9]{4}-W[0-9]{2}$'),
  preview boolean NOT NULL DEFAULT false,
  items integer NOT NULL CHECK(items >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX digest_send_week ON digest_send(organization_id,user_id,week) WHERE NOT preview;
CREATE INDEX digest_send_user ON digest_send(user_id,organization_id);

ALTER TABLE mail_job DROP CONSTRAINT mail_job_category_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_category_check CHECK(category IN ('security','administrative','sport','digest'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK (resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license','newsletter','event_mail','funding','digest'));
