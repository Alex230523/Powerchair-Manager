-- B6: public pages, widgets, a public calendar feed, a read API with keys
-- and signed webhooks (module 18). Nothing is public until the club says so.

-- 1. The club's public page: its address, its blocks, its public calendar feed (revocable).
ALTER TABLE organization ADD COLUMN IF NOT EXISTS public_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS public_slug text;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS public_blocks text[] NOT NULL DEFAULT '{identity,teams,next_matches,results,standings,sponsors}';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS public_intro text NOT NULL DEFAULT '';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS public_ics_token text;
DO $$ BEGIN
  ALTER TABLE organization ADD CONSTRAINT organization_public_check CHECK ((public_slug IS NULL OR public_slug ~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$') AND length(public_intro) <= 2000 AND (public_ics_token IS NULL OR length(public_ics_token) BETWEEN 32 AND 64));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS organization_public_slug ON organization(public_slug) WHERE public_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organization_public_ics ON organization(public_ics_token) WHERE public_ics_token IS NOT NULL;

-- 2. A minor's name (and image) on public pages only with an explicit consent.
ALTER TABLE club_person ADD COLUMN IF NOT EXISTS public_name_consent boolean NOT NULL DEFAULT false;
ALTER TABLE club_person ADD COLUMN IF NOT EXISTS public_name_consent_at timestamptz;

-- 3. A sponsor shown on the public page when its package says so.
ALTER TABLE partner_package ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false;

-- 4. A tournament's public page (calendar, validated results, standings), and the trace of a corrected result.
ALTER TABLE tournament ADD COLUMN IF NOT EXISTS public_page boolean NOT NULL DEFAULT false;
ALTER TABLE tournament_match ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

-- 5. Read API keys: only their hash is kept; scopes; revocable; a counter per minute for the rate limit.
CREATE TABLE IF NOT EXISTS api_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[a-z0-9]{8}$'),
  key_hash text NOT NULL,
  scopes text[] NOT NULL CHECK (scopes <@ ARRAY['read:teams', 'read:matches', 'read:tournaments', 'read:events']::text[] AND cardinality(scopes) >= 1),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text REFERENCES "user"(id)
);
CREATE TABLE IF NOT EXISTS api_rate (
  key_id uuid NOT NULL REFERENCES api_key(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

-- 6. Webhooks signed with HMAC, and the journal of their deliveries (one per hook and event, retried).
CREATE TABLE IF NOT EXISTS webhook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url LIKE 'https://%' AND length(url) <= 500),
  secret_sealed text NOT NULL,
  events text[] NOT NULL CHECK (events <@ ARRAY['registration.validated', 'match.validated', 'document.expired', 'payment.reconciled']::text[] AND cardinality(events) >= 1),
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE TABLE IF NOT EXISTS webhook_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  event text NOT NULL,
  event_key text NOT NULL CHECK (length(event_key) <= 200),
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  last_status integer,
  last_error text NOT NULL DEFAULT '' CHECK (length(last_error) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (webhook_id, event_key),
  FOREIGN KEY (webhook_id, organization_id) REFERENCES webhook(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS webhook_delivery_ready ON webhook_delivery(next_at) WHERE state = 'pending';
