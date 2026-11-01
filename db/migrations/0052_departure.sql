-- Wave 17 (J1): why a person left the club, chosen in the departure window.
-- « deceased » archives the file (In memoriam): no notification, reminder,
-- dues or email any more; only the club president sets or lifts it.
ALTER TABLE club_person
  ADD COLUMN departure_status text CHECK (departure_status IN ('stopped', 'moved', 'unknown', 'deceased')),
  ADD COLUMN departure_note text NOT NULL DEFAULT '' CHECK (length(departure_note) <= 500);
