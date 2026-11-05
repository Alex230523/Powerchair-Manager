-- 04/11/2026 (point 5): transfer periods that come back every year on the same dates.
ALTER TABLE transfer_rules ADD COLUMN IF NOT EXISTS yearly_windows boolean NOT NULL DEFAULT false;
