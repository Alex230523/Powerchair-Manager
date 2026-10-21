-- Getting started of a new club (wave 15, C3): the president may hide the card;
-- the steps themselves are always computed from the club's real data.
ALTER TABLE organization ADD COLUMN setup_hidden boolean NOT NULL DEFAULT false;
