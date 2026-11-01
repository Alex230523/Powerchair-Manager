-- Wave 17 (J2): « Excusé » (absence announced beforehand), counted apart from
-- « Absent »; each mark of the roll call can be undone for a short while.
ALTER TABLE attendance_invitation DROP CONSTRAINT attendance_invitation_actual_check;
ALTER TABLE attendance_invitation ADD CONSTRAINT attendance_invitation_actual_check CHECK (actual IN ('unchecked', 'present', 'absent', 'excused', 'late', 'early'));

ALTER TABLE undo_action DROP CONSTRAINT undo_action_kind_check;
ALTER TABLE undo_action ADD CONSTRAINT undo_action_kind_check CHECK (kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','messageHide','payment','eventCancel','registrationDecision','affiliationPaid','operationDelete','attendanceMark'));
