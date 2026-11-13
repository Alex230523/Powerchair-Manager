-- 12/11/2026: a person deletes their account from Réglages, Mon compte. The
-- request waits 30 days (it can be cancelled until then), then the account is
-- anonymised: no more sign-in, no name, no e-mail, no photo. The clubs keep
-- their own files (a player's sheet belongs to the club's records).
CREATE TABLE IF NOT EXISTS account_deletion (
  user_id text PRIMARY KEY REFERENCES "user"(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_on date NOT NULL,
  cancelled_at timestamptz,
  completed_at timestamptz,
  CHECK (cancelled_at IS NULL OR completed_at IS NULL)
);
CREATE INDEX IF NOT EXISTS account_deletion_due ON account_deletion (due_on) WHERE cancelled_at IS NULL AND completed_at IS NULL;
