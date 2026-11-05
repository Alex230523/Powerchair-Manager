-- 05/11/2026 (lot 3): a match can be followed live on a public page, by a
-- link the club shares; the link is a random token, revoked by the club.
ALTER TABLE match ADD COLUMN IF NOT EXISTS live_token text UNIQUE CHECK (live_token IS NULL OR live_token ~ '^[0-9a-f]{32}$');
ALTER TABLE match ADD COLUMN IF NOT EXISTS live_public_at timestamptz;
