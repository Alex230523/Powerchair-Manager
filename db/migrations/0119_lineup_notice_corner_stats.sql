-- 04/11/2026 (point 13): the players (and their parents) are told once when the line-up is revealed.
ALTER TABLE match ADD COLUMN IF NOT EXISTS lineup_notified_at timestamptz;
