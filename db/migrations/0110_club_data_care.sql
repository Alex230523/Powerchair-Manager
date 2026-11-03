-- 21: opening the service to other clubs, whose data processor the
-- operator becomes. The processing agreement accepted by each club (one
-- line per version), the full export of a club, its closure after 30 days,
-- the people's requests sent to the right club, and the retention periods
-- with their planned purge. Drafts of texts live in docs/legal/.

-- A club opened by its federation needs its president's acceptance before
-- members are invited; every club that accepted once accepts a new version.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS dpa_required boolean NOT NULL DEFAULT false;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS closed_at timestamptz;
CREATE TABLE IF NOT EXISTS club_dpa_acceptance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 version text NOT NULL CHECK (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
 accepted_by text NOT NULL REFERENCES "user"(id),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id, version)
);

-- The full export: built in the background, downloaded through a link that
-- expires, every step written in the journal.
CREATE TABLE IF NOT EXISTS club_export (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 requested_by text NOT NULL REFERENCES "user"(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed', 'expired')),
 content bytea,
 size_bytes integer,
 manifest jsonb,
 token_hash text UNIQUE,
 ready_at timestamptz,
 expires_at timestamptz,
 downloaded_at timestamptz,
 error text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS club_export_pending ON club_export(status) WHERE status = 'pending';

-- The closure: asked by the presidency, 30 days to change one's mind, then
-- the deletion and its certificate (the accounting stays, as the law asks).
CREATE TABLE IF NOT EXISTS club_termination (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 requested_by text NOT NULL REFERENCES "user"(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 effective_on date NOT NULL,
 reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
 cancelled_at timestamptz,
 cancelled_by text REFERENCES "user"(id),
 completed_at timestamptz,
 certificate jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS club_termination_open ON club_termination(organization_id) WHERE cancelled_at IS NULL AND completed_at IS NULL;

-- A person's request (access, rectification, erasure), received in the app
-- and sent to the club responsible for the data, with its deadline.
CREATE TABLE IF NOT EXISTS data_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 requester_id text NOT NULL REFERENCES "user"(id),
 profile_id uuid,
 kind text NOT NULL CHECK (kind IN ('access', 'rectification', 'erasure')),
 details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
 status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'done', 'refused')),
 due_on date NOT NULL,
 response text NOT NULL DEFAULT '' CHECK (length(response) <= 2000),
 handled_by text REFERENCES "user"(id),
 handled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS data_request_org ON data_request(organization_id, status, due_on);

-- Retention by category, set by each club within bounds; the purge journal.
CREATE TABLE IF NOT EXISTS retention_setting (
 organization_id uuid NOT NULL REFERENCES organization(id),
 category text NOT NULL CHECK (category IN ('notifications', 'audit', 'health_documents', 'sensitive_access')),
 months integer NOT NULL CHECK (months BETWEEN 1 AND 240),
 updated_by text REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, category)
);
CREATE TABLE IF NOT EXISTS retention_purge (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 category text NOT NULL,
 removed integer NOT NULL,
 run_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retention_purge_org ON retention_purge(organization_id, run_at DESC);
