-- Wave 16 (R1): places per team. NULL means no limit. Used on the team card,
-- when accepting a registration into a team, when moving a player, and on
-- the president's home page (a team over its places).
ALTER TABLE team ADD COLUMN capacity int CHECK (capacity BETWEEN 1 AND 100);
