-- Wave 17 (O1): one task list for the whole club. funding_task (wave 15,
-- sponsors and grants) keeps its name and its rows, and becomes the common
-- task table: a type, and what the task is about (an event, a match, a trip,
-- an obligation, a chair) besides a sponsor or a grant.
ALTER TABLE funding_task
  ADD COLUMN kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('transport', 'training', 'documents', 'sponsor', 'grant', 'obligation', 'equipment', 'other')),
  ADD COLUMN event_id uuid REFERENCES calendar_event(id) ON DELETE SET NULL,
  ADD COLUMN match_id uuid REFERENCES match(id) ON DELETE SET NULL,
  ADD COLUMN trip_id uuid REFERENCES trip(id) ON DELETE SET NULL,
  ADD COLUMN obligation_id uuid REFERENCES club_obligation(id) ON DELETE SET NULL,
  ADD COLUMN chair_id uuid REFERENCES equipment_chair(id) ON DELETE SET NULL;
UPDATE funding_task SET kind = CASE WHEN partner_id IS NOT NULL THEN 'sponsor' ELSE 'grant' END;
ALTER TABLE funding_task DROP CONSTRAINT funding_task_check;
ALTER TABLE funding_task ADD CONSTRAINT funding_task_source CHECK (
  NOT (partner_id IS NOT NULL AND grant_id IS NOT NULL)
  AND (kind <> 'sponsor' OR partner_id IS NOT NULL)
  AND (kind <> 'grant' OR grant_id IS NOT NULL)
  AND (kind IN ('sponsor', 'grant') OR (partner_id IS NULL AND grant_id IS NULL))
);
CREATE INDEX funding_task_responsible ON funding_task(organization_id, responsible_id) WHERE status = 'todo';

-- Templates per type (Settings > Activities): a list of tasks with how many days before the date they are due.
CREATE TABLE task_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('transport', 'training', 'documents', 'obligation', 'equipment', 'other')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  items jsonb NOT NULL DEFAULT '[]',
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- The coach declares a driving licence; the club may check a copy.
ALTER TABLE driver_licence
  ADD COLUMN declared_by_self boolean NOT NULL DEFAULT false,
  ADD COLUMN verified_by text REFERENCES "user"(id),
  ADD COLUMN verified_on date,
  ADD COLUMN copy_filename text CHECK (copy_filename IS NULL OR length(trim(copy_filename)) BETWEEN 1 AND 200),
  ADD COLUMN copy_media_type text CHECK (copy_media_type IS NULL OR copy_media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  ADD COLUMN copy_content bytea CHECK (copy_content IS NULL OR octet_length(copy_content) BETWEEN 1 AND 5242880),
  ADD COLUMN reminded_on date;

-- A coach asks the federation to validate a course with a proof (certificate).
ALTER TABLE training_request
  ADD COLUMN proof_filename text CHECK (proof_filename IS NULL OR length(trim(proof_filename)) BETWEEN 1 AND 200),
  ADD COLUMN proof_media_type text CHECK (proof_media_type IS NULL OR proof_media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  ADD COLUMN proof_content bytea CHECK (proof_content IS NULL OR octet_length(proof_content) BETWEEN 1 AND 5242880);

-- A licence copy and a course proof count in the club's storage.
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
SELECT organization_id, 'finance', id, filename, size_bytes, uploaded_at, 'statement', id FROM bank_statement WHERE removed_at IS NULL
UNION ALL
SELECT organization_id, 'other', profile_id, copy_filename, octet_length(copy_content)::bigint, updated_at, 'licence', profile_id FROM driver_licence WHERE copy_content IS NOT NULL
UNION ALL
SELECT organization_id, 'other', id, proof_filename, octet_length(proof_content)::bigint, requested_at, 'training', profile_id FROM training_request WHERE proof_content IS NOT NULL;

-- The first-connection tutorial, seen once per account and audience (coach today,
-- players and parents later with their own texts), relaunched from Settings > My account.
CREATE TABLE user_tutorial (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('coach', 'player', 'parent')),
  tutorial_seen_at timestamptz,
  PRIMARY KEY (user_id, audience)
);
