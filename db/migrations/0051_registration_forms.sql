-- Wave 17 (F1): registration forms in a list, opened to the public between
-- two optional dates, archived instead of deleted; the club's own templates;
-- a decision on an application can be undone (its emails wait meanwhile).
ALTER TABLE registration_form
  ADD COLUMN archived boolean NOT NULL DEFAULT false,
  ADD COLUMN opens_on date,
  ADD COLUMN closes_on date,
  ADD CONSTRAINT registration_form_dates CHECK (opens_on IS NULL OR closes_on IS NULL OR closes_on >= opens_on);
-- A club form saved as a template, to start the next ones from it.
CREATE TABLE registration_template (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
 fields jsonb NOT NULL DEFAULT '[]'::jsonb,
 capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 10000),
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id, name)
);
ALTER TABLE undo_action DROP CONSTRAINT undo_action_kind_check;
ALTER TABLE undo_action ADD CONSTRAINT undo_action_kind_check CHECK (kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','messageHide','payment','eventCancel','registrationDecision'));
