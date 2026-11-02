-- 20: « Nouveautés », read or not, kept per account (like the tutorial),
-- and the small window after signing in that one may switch off. Additive.
CREATE TABLE IF NOT EXISTS user_news_read (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entry_id text NOT NULL CHECK (entry_id ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$'),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_id)
);
CREATE TABLE IF NOT EXISTS user_news_setting (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  popup_off boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
