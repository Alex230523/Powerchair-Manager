-- Wave 15 (C11): what the activity report needs. A tournament's result
-- (final place, number of teams, a short note) and the "highlight" flag that
-- picks the club's big events in the calendar.
ALTER TABLE trip ADD COLUMN final_rank integer CHECK (final_rank IS NULL OR final_rank BETWEEN 1 AND 500);
ALTER TABLE trip ADD COLUMN teams_count integer CHECK (teams_count IS NULL OR teams_count BETWEEN 1 AND 500);
ALTER TABLE trip ADD COLUMN result_note text NOT NULL DEFAULT '' CHECK (length(result_note) <= 160);
ALTER TABLE trip ADD CONSTRAINT trip_rank_within CHECK (final_rank IS NULL OR teams_count IS NULL OR final_rank <= teams_count);
ALTER TABLE calendar_event ADD COLUMN highlight boolean NOT NULL DEFAULT false;
