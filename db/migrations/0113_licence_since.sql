-- 04/11/2026 (retours, lot G): since when a driver holds their licence.
ALTER TABLE driver_licence ADD COLUMN IF NOT EXISTS obtained_on date;
