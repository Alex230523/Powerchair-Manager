-- 05/11/2026 (revue): the match sheet photos and the transfer payment proofs
-- count in the club's storage, like every other file. Additive (the view is
-- replaced, the files were already there).
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
SELECT organization_id, 'other', id, proof_filename, octet_length(proof_content)::bigint, requested_at, 'training', profile_id FROM training_request WHERE proof_content IS NOT NULL
UNION ALL
SELECT ph.organization_id, 'photos', ph.match_id, m.opponent, octet_length(ph.content)::bigint, ph.uploaded_at, 'match_sheet', ph.match_id
  FROM match_sheet_photo ph JOIN match m ON m.id = ph.match_id
UNION ALL
SELECT t.to_organization_id, 'other', t.id, t.payment_proof_filename, octet_length(t.payment_proof)::bigint, COALESCE(t.completed_at, t.created_at), 'transfer_proof', t.id
  FROM transfer_offer t WHERE t.payment_proof IS NOT NULL;

-- Indexes for the queries added on 04/11/2026: the player's transfer whose
-- compensation is not confirmed (match sheet), the line-ups still to announce.
CREATE INDEX IF NOT EXISTS transfer_offer_target_unpaid ON transfer_offer(target_profile_id) WHERE completed_at IS NOT NULL AND payment_confirmed_at IS NULL;
CREATE INDEX IF NOT EXISTS match_lineup_to_announce ON match(starts_at) WHERE lineup_notified_at IS NULL AND status = 'scheduled';
