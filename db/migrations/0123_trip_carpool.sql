-- 05/11/2026 (lot 4): a parent (or an adult player) offers seats in their car
-- for a trip; the organiser accepts (the car joins the trip's vehicles) or
-- declines.
CREATE TABLE IF NOT EXISTS trip_carpool_offer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  seats integer NOT NULL CHECK (seats BETWEEN 1 AND 8),
  wheelchair_places integer NOT NULL DEFAULT 0 CHECK (wheelchair_places BETWEEN 0 AND 4),
  legs text NOT NULL DEFAULT 'both' CHECK (legs IN ('both', 'out', 'back')),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 60),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'declined', 'withdrawn')),
  vehicle_id uuid REFERENCES trip_vehicle(id) ON DELETE SET NULL,
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS trip_carpool_offer_trip ON trip_carpool_offer(trip_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS trip_carpool_offer_open ON trip_carpool_offer(trip_id, profile_id) WHERE status = 'offered';
