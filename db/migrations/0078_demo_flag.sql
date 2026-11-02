-- Technical fix 13.1: an organisation of the demo is marked, so a preview
-- build refuses a database that holds anything else (scripts/vercel-build.mjs).
ALTER TABLE organization ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
