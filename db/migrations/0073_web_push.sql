-- B4: Web Push notifications (PWA). One subscription per device and account,
-- push preferences per club and topic, and a push queue next to the mail one.

-- 1. A device that accepts notifications: its endpoint and keys (RFC 8291).
CREATE TABLE IF NOT EXISTS push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%' AND length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 100),
  auth text NOT NULL CHECK (length(auth) BETWEEN 16 AND 30),
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failures integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscription_user ON push_subscription(user_id);

-- 2. What may reach the phone, per club and topic (on unless switched off).
CREATE TABLE IF NOT EXISTS push_preference (
  organization_id uuid NOT NULL,
  user_id text NOT NULL,
  topic text NOT NULL CHECK (topic IN ('invitation', 'change', 'urgent', 'dues', 'document', 'message', 'other')),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, user_id, topic),
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_membership(organization_id, user_id)
);

-- 3. The queue: one line per person and event; rights and preferences are read again when it leaves.
CREATE TABLE IF NOT EXISTS push_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (topic IN ('invitation', 'change', 'urgent', 'dues', 'document', 'message', 'other')),
  kind text NOT NULL,
  category text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  payload_ciphertext text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'sent', 'grouped', 'cancelled', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  locked_until timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_job_ready ON push_job(available_at, created_at) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS push_job_recipient ON push_job(recipient_user_id, created_at) WHERE state = 'pending';
