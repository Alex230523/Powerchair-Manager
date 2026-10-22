-- Wave 17 (N1): an operation can be deleted (while its financial year is not
-- approved by the assembly), and bank statements are filed as proof, month
-- by month, with their closing balance. A deleted operation stays in the
-- table (cancelled and hidden) so the undo and the audit keep it.
ALTER TABLE finance_transaction
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by text REFERENCES "user"(id),
  ADD COLUMN delete_reason text NOT NULL DEFAULT '' CHECK (length(delete_reason) <= 500);

CREATE TABLE bank_statement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  account text NOT NULL DEFAULT '' CHECK (length(account) <= 80),
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  filename text NOT NULL CHECK (length(trim(filename)) BETWEEN 1 AND 200),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'text/csv')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  closing_balance_cents bigint,
  balance_source text NOT NULL DEFAULT 'none' CHECK (balance_source IN ('none', 'entered', 'csv')),
  uploaded_by text NOT NULL REFERENCES "user"(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
ALTER TABLE bank_statement ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content)) STORED;
CREATE INDEX bank_statement_month ON bank_statement(organization_id, month) WHERE removed_at IS NULL;

-- Statements count in the club's storage, with the receipts (finance).
CREATE OR REPLACE VIEW storage_file AS
SELECT d.organization_id, 'documents'::text AS category, v.id, v.filename AS name, v.size_bytes, v.uploaded_at AS created_at, 'document'::text AS origin, d.id AS ref
  FROM document_version v JOIN club_document d ON d.id = v.document_id
UNION ALL
SELECT a.organization_id, 'registrations', r.id, r.filename, r.size_bytes, r.created_at, 'registration', a.id
  FROM registration_attachment r JOIN registration_application a ON a.id = r.application_id
UNION ALL
SELECT organization_id, 'finance', id, filename, size_bytes, uploaded_at, 'receipt', transaction_id FROM finance_receipt WHERE removed_at IS NULL
UNION ALL
SELECT p.organization_id, 'funding', p.id, p.filename, p.size_bytes, p.uploaded_at, CASE WHEN t.grant_id IS NULL THEN 'partner' ELSE 'grant' END, COALESCE(t.grant_id, t.partner_id)
  FROM funding_task_proof p JOIN funding_task t ON t.id = p.task_id WHERE p.removed_at IS NULL
UNION ALL
SELECT organization_id, 'photos', organization_id, 'logo', size_bytes, updated_at, 'logo', organization_id FROM organization_logo
UNION ALL
SELECT tr.organization_id, 'photos', tr.id, t.name, tr.size_bytes, COALESCE(tr.photo_updated_at, tr.created_at), 'trophy', t.id
  FROM tournament_trophy tr JOIN tournament t ON t.id = tr.tournament_id WHERE tr.photo IS NOT NULL
UNION ALL
SELECT g.organization_id, 'photos', g.exercise_id, e.title, g.size_bytes, g.updated_at, 'exercise', e.id
  FROM exercise_diagram g JOIN exercise e ON e.id = g.exercise_id
UNION ALL
SELECT organization_id, 'photos', id, title, size_bytes, updated_at, 'award', id FROM award WHERE photo IS NOT NULL
UNION ALL
SELECT organization_id, 'other', id, signer_name, size_bytes, signed_at, 'signature', document_id FROM document_signature
UNION ALL
SELECT organization_id, 'finance', id, filename, size_bytes, uploaded_at, 'statement', id FROM bank_statement WHERE removed_at IS NULL;

ALTER TABLE undo_action DROP CONSTRAINT undo_action_kind_check;
ALTER TABLE undo_action ADD CONSTRAINT undo_action_kind_check CHECK (kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','messageHide','payment','eventCancel','registrationDecision','affiliationPaid','operationDelete'));
