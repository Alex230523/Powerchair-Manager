-- 13/11/2026: the national staff reads the care instructions of the players
-- who consented from its own page; each reading is journaled in the player's
-- club, like a trip's care book.
ALTER TABLE sensitive_access_log DROP CONSTRAINT IF EXISTS sensitive_access_log_kind_check;
ALTER TABLE sensitive_access_log ADD CONSTRAINT sensitive_access_log_kind_check
  CHECK (kind IN ('player_health', 'registration_confidential', 'sensitive_document', 'offline_book', 'trip_care', 'incident_health', 'incident_care', 'national_care'));
