-- 24: the internal messaging is retired. The club's Communication
-- (newsletters, event mails) stays, under its own module name.
-- 1. The module « messages » becomes « communication » (settings kept).
ALTER TABLE organization DROP CONSTRAINT organization_disabled_modules_check;
UPDATE organization SET disabled_modules = array_replace(disabled_modules, 'messages', 'communication') WHERE 'messages' = ANY(disabled_modules);
ALTER TABLE organization ADD CONSTRAINT organization_disabled_modules_check
  CHECK (disabled_modules <@ ARRAY['finance','dues','equipment','matches','licenses','reminders','communication','statistics','trips','fundraising']::text[]);
-- 2. Hiding a message can no longer be undone.
DELETE FROM undo_action WHERE kind = 'messageHide';
ALTER TABLE undo_action DROP CONSTRAINT undo_action_kind_check;
ALTER TABLE undo_action ADD CONSTRAINT undo_action_kind_check CHECK (kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','payment','eventCancel','registrationDecision','affiliationPaid','operationDelete','attendanceMark'));
-- 3. The clubs are told before the exchanges go: one notice per club, the
--    tables (message_thread, message_participant, internal_message,
--    message_report) dropped by a later migration, 14 days after it.
CREATE TABLE messaging_retirement (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  notified_at timestamptz NOT NULL DEFAULT now(),
  delete_after date NOT NULL
);
