-- 04/11/2026 (retours, lot F): corners are match facts (ours and theirs);
-- a line-up can be revealed on its own some time before kick-off.
-- Additive and idempotent: the checks are widened, never narrowed.
ALTER TABLE match_live_event DROP CONSTRAINT IF EXISTS match_live_event_kind_check;
ALTER TABLE match_live_event ADD CONSTRAINT match_live_event_kind_check CHECK (kind IN ('goal', 'goal_against', 'assist', 'yellow', 'red', 'sub_in', 'sub_out', 'timeout', 'corner', 'corner_against'));
ALTER TABLE match_live_event DROP CONSTRAINT IF EXISTS match_live_event_check;
ALTER TABLE match_live_event ADD CONSTRAINT match_live_event_check CHECK (kind IN ('goal_against', 'timeout', 'corner', 'corner_against') OR profile_id IS NOT NULL);
ALTER TABLE match ADD COLUMN IF NOT EXISTS lineup_reveal_minutes integer CHECK (lineup_reveal_minutes IS NULL OR lineup_reveal_minutes BETWEEN 0 AND 10080);
