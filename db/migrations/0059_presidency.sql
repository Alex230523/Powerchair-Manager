-- Wave 17 (G1): the club president hands over the presidency. The invitation
-- carries what the outgoing president keeps (a member without mandate, a
-- coach, or nothing) and a message; its valid_from is the date of effect.
ALTER TABLE invitation
  ADD COLUMN outgoing_user_id text REFERENCES "user"(id),
  ADD COLUMN outgoing_role text CHECK (outgoing_role IS NULL OR outgoing_role IN ('member', 'coach', 'none')),
  ADD COLUMN message text NOT NULL DEFAULT '' CHECK (length(message) <= 1000);
