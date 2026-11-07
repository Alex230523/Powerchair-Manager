-- Security (07/11/2026), cross-site scripting: a shared venue is read by every
-- club, so its website is a web address only (http or https), never
-- `javascript:` nor `data:`. The form refuses them since this date; an older
-- row holding one loses it, and the database refuses a new one.
UPDATE shared_venue SET website = '' WHERE website <> '' AND website !~* '^https?://';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_venue_website_web' AND conrelid = 'shared_venue'::regclass) THEN
    ALTER TABLE shared_venue ADD CONSTRAINT shared_venue_website_web CHECK (website = '' OR website ~* '^https?://');
  END IF;
END $$;
