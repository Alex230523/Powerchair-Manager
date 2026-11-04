-- 14: « Bord de terrain ». The day's events gain the assist and the timeout;
-- the photo of the paper match sheet is filed with the match. Additive and
-- idempotent (the checks are widened, never narrowed).
ALTER TABLE match_live_event DROP CONSTRAINT IF EXISTS match_live_event_kind_check;
ALTER TABLE match_live_event ADD CONSTRAINT match_live_event_kind_check CHECK (kind IN ('goal', 'goal_against', 'assist', 'yellow', 'red', 'sub_in', 'sub_out', 'timeout'));
ALTER TABLE match_live_event DROP CONSTRAINT IF EXISTS match_live_event_check;
ALTER TABLE match_live_event ADD CONSTRAINT match_live_event_check CHECK (kind IN ('goal_against', 'timeout') OR profile_id IS NOT NULL);
CREATE TABLE IF NOT EXISTS match_sheet_photo (
  match_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(id),
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 6291456),
  uploaded_by text NOT NULL REFERENCES "user"(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (match_id, organization_id) REFERENCES match(id, organization_id)
);
