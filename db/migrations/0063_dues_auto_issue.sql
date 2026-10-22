-- A3: the rate issued automatically when a registration is accepted
-- (Réglages › Argent). NULL: nothing is issued by itself.
ALTER TABLE organization ADD COLUMN dues_auto_plan_id uuid REFERENCES dues_plan(id);

-- A new message: « Cotisation émise », with the amount and the schedule.
ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK (kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update','attendance_update','dues_reminder','document_reminder','training_update','match_update','registration_link','license_update','funding_task','dues_issued'));
