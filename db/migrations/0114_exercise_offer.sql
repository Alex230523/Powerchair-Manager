-- 04/11/2026 (retours, lot H): a club sends an exercise sheet to another club
-- of its federation; that club's presidency accepts (a copy arrives in its
-- library, with its creator) or refuses.
CREATE TABLE IF NOT EXISTS exercise_offer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 exercise_id uuid NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
 from_organization_id uuid NOT NULL REFERENCES organization(id),
 to_organization_id uuid NOT NULL REFERENCES organization(id),
 sent_by text NOT NULL REFERENCES "user"(id),
 message text NOT NULL DEFAULT '' CHECK (length(message) <= 500),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'refused')),
 decided_by text REFERENCES "user"(id),
 decided_at timestamptz,
 copy_id uuid REFERENCES exercise(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (from_organization_id <> to_organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_offer_pending ON exercise_offer(exercise_id, to_organization_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS exercise_offer_to ON exercise_offer(to_organization_id, status);
