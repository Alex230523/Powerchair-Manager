-- Wave 15 (C9): a calendar subscription can follow only "my events" (those
-- where one of my profiles is invited or a participant, or that I lead).
ALTER TABLE calendar_feed ADD COLUMN only_mine boolean NOT NULL DEFAULT false;
