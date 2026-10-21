-- Wave 16 (S1): the club statistics. Three additions, all additive.
--
-- 1. Storage. Every table holding files gets a size_bytes column, computed by
--    the database from the stored bytes (so filled at each upload, and once
--    for what already exists when the column is added). storage_file lists the
--    files of an organisation with their category, storage_usage adds them up.
--    organization.storage_quota_bytes (1 GB by default) has no screen: only
--    the platform operator changes it. Above the quota, uploads are refused.
ALTER TABLE document_version ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content_ciphertext)) STORED;
ALTER TABLE registration_attachment ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content)) STORED;
ALTER TABLE finance_receipt ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content)) STORED;
ALTER TABLE funding_task_proof ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content)) STORED;
ALTER TABLE organization_logo ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content)) STORED;
ALTER TABLE tournament_trophy ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (COALESCE(octet_length(photo), 0)) STORED;
ALTER TABLE exercise_diagram ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(content)) STORED;
ALTER TABLE document_signature ADD COLUMN size_bytes bigint GENERATED ALWAYS AS (octet_length(signature_png)) STORED;
ALTER TABLE organization ADD COLUMN storage_quota_bytes bigint NOT NULL DEFAULT 1073741824 CHECK (storage_quota_bytes > 0);

-- 2. Classification history: one row per state of a player's classification,
--    from now on (the trigger writes it at every change, whoever changes it).
--    valid_to is the day the next state starts; NULL for the current one.
CREATE TABLE classification_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 classification text NOT NULL CHECK (classification IN ('PF1', 'PF2', 'pending', 'not_classified')),
 status text NOT NULL CHECK (status IN ('unverified', 'requested', 'validated', 'refused')),
 valid_from date NOT NULL DEFAULT CURRENT_DATE,
 valid_to date,
 CHECK (valid_to IS NULL OR valid_to >= valid_from),
 FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX classification_history_profile ON classification_history(organization_id, profile_id, valid_from);
CREATE FUNCTION pfm_classification_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.classification IS NOT DISTINCT FROM NEW.classification AND OLD.classification_status IS NOT DISTINCT FROM NEW.classification_status AND OLD.profile_id = NEW.profile_id THEN
    RETURN NEW;
  END IF;
  UPDATE classification_history SET valid_to = CURRENT_DATE WHERE profile_id = NEW.profile_id AND valid_to IS NULL;
  INSERT INTO classification_history(organization_id, profile_id, classification, status) VALUES (NEW.organization_id, NEW.profile_id, NEW.classification, NEW.classification_status);
  RETURN NEW;
END $$;
CREATE TRIGGER player_sport_profile_history AFTER INSERT OR UPDATE ON player_sport_profile FOR EACH ROW EXECUTE FUNCTION pfm_classification_history();
-- Today's state of every player, the starting point of the history.
INSERT INTO classification_history(organization_id, profile_id, classification, status)
SELECT organization_id, profile_id, classification, classification_status FROM player_sport_profile;

-- 3. Hall of fame: the club's prizes. A prize of a person is shown on the
--    public page only when « Peut être publié » is ticked; a photo likewise.
--    trip_id: the tournament trip it was suggested from (once per trip).
CREATE TABLE award (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 season_id uuid,
 awarded_on date NOT NULL,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
 competition text NOT NULL DEFAULT '' CHECK (length(competition) <= 120),
 kind text NOT NULL CHECK (kind IN ('team', 'individual', 'club')),
 place integer CHECK (place IS NULL OR place BETWEEN 1 AND 500),
 team_id uuid,
 profile_id uuid,
 photo bytea CHECK (photo IS NULL OR octet_length(photo) BETWEEN 1 AND 1572864),
 photo_type text CHECK (photo_type IS NULL OR photo_type IN ('image/png', 'image/jpeg', 'image/webp')),
 size_bytes bigint GENERATED ALWAYS AS (COALESCE(octet_length(photo), 0)) STORED,
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
 source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'tournament')),
 trip_id uuid,
 publishable boolean NOT NULL DEFAULT false,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 CHECK ((photo IS NULL) = (photo_type IS NULL)),
 CHECK (kind <> 'individual' OR profile_id IS NOT NULL),
 CHECK (source <> 'tournament' OR trip_id IS NOT NULL),
 FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id),
 FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id),
 FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
 FOREIGN KEY (trip_id, organization_id) REFERENCES trip(id, organization_id)
);
CREATE INDEX award_org ON award(organization_id, awarded_on DESC);
CREATE UNIQUE INDEX award_trip ON award(trip_id) WHERE trip_id IS NOT NULL;
-- The public Hall of fame page (Settings > Club): its address while switched on.
ALTER TABLE organization ADD COLUMN hall_of_fame_widget uuid UNIQUE;

-- The files of each organisation, by category, with what the page links to.
CREATE VIEW storage_file AS
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
SELECT organization_id, 'other', id, signer_name, size_bytes, signed_at, 'signature', document_id FROM document_signature;
CREATE VIEW storage_usage AS
SELECT organization_id, category, sum(size_bytes)::bigint AS bytes, count(*)::int AS files FROM storage_file GROUP BY organization_id, category;
