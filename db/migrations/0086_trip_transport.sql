-- 3: trips become transport logistics. Additive; the existing trips keep
-- everything they had.
-- 1. Two modes: « transport » (one day, the default) and « stay » (several
--    days: accommodation, programme and budget as before). The existing
--    trips become a stay when they last more than one day, else transport.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip' AND column_name = 'mode') THEN
    ALTER TABLE trip ADD COLUMN mode text NOT NULL DEFAULT 'transport';
    UPDATE trip SET mode = 'stay' WHERE ends_on > starts_on;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE trip ADD CONSTRAINT trip_mode_check CHECK (mode IN ('transport', 'stay'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. A trip belongs to one event, one match or one tournament day (not the whole tournament).
ALTER TABLE trip
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES match(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tournament_day_id uuid REFERENCES tournament_day(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS trip_match ON trip(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trip_tournament_day ON trip(tournament_day_id) WHERE tournament_day_id IS NOT NULL;

-- 3. The rental companies of the contact book.
ALTER TABLE contact DROP CONSTRAINT IF EXISTS contact_tags_check;
ALTER TABLE contact ADD CONSTRAINT contact_tags_check
  CHECK (tags <@ ARRAY['sponsor','donor','public','federation','venue','press','supplier','medical','volunteer','rental','other']::text[]);

-- 3. Each vehicle of a trip has a type: the club's, a rental, a private one.
--    The former vehicles without a fleet vehicle become private ones.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_vehicle' AND column_name = 'kind') THEN
    ALTER TABLE trip_vehicle ADD COLUMN kind text NOT NULL DEFAULT 'club';
    UPDATE trip_vehicle SET kind = 'private' WHERE vehicle_id IS NULL;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE trip_vehicle ADD CONSTRAINT trip_vehicle_kind_check CHECK (kind IN ('club', 'rental', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE trip_vehicle
  ADD COLUMN IF NOT EXISTS rental_contact_id uuid REFERENCES contact(id),
  ADD COLUMN IF NOT EXISTS pickup_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS return_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS booking_ref text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS planned_cost_cents integer,
  ADD COLUMN IF NOT EXISTS deposit_cents integer,
  ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES club_person(id),
  ADD COLUMN IF NOT EXISTS owner_contact_id uuid REFERENCES contact(id),
  ADD COLUMN IF NOT EXISTS ramp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mileage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distance_km integer,
  ADD COLUMN IF NOT EXISTS fuel_cents integer,
  ADD COLUMN IF NOT EXISTS equipment text NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE trip_vehicle ADD CONSTRAINT trip_vehicle_more_check CHECK (
    length(pickup_address) <= 300 AND length(return_address) <= 300 AND length(booking_ref) <= 80 AND length(equipment) <= 1000
    AND (planned_cost_cents IS NULL OR planned_cost_cents BETWEEN 0 AND 10000000)
    AND (deposit_cents IS NULL OR deposit_cents BETWEEN 0 AND 10000000)
    AND (fuel_cents IS NULL OR fuel_cents BETWEEN 0 AND 10000000)
    AND (distance_km IS NULL OR distance_km BETWEEN 0 AND 10000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. The mileage allowance's rate, set in Réglages › Activités.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS mileage_rate_cents integer;
DO $$ BEGIN
  ALTER TABLE organization ADD CONSTRAINT organization_mileage_rate_check CHECK (mileage_rate_cents IS NULL OR mileage_rate_cents BETWEEN 0 AND 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Several drivers per vehicle (out and back). driver_profile_id stays the first one.
CREATE TABLE IF NOT EXISTS trip_vehicle_driver (
  trip_vehicle_id uuid NOT NULL REFERENCES trip_vehicle(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES club_person(id),
  legs text NOT NULL DEFAULT 'both' CHECK (legs IN ('both', 'out', 'back')),
  PRIMARY KEY (trip_vehicle_id, profile_id)
);
INSERT INTO trip_vehicle_driver(trip_vehicle_id, profile_id, legs)
SELECT id, driver_profile_id, legs FROM trip_vehicle WHERE driver_profile_id IS NOT NULL ON CONFLICT DO NOTHING;

-- 5. The chairs carried (club's and players', from Matériel).
CREATE TABLE IF NOT EXISTS trip_vehicle_chair (
  trip_vehicle_id uuid NOT NULL REFERENCES trip_vehicle(id) ON DELETE CASCADE,
  chair_id uuid NOT NULL REFERENCES equipment_chair(id),
  PRIMARY KEY (trip_vehicle_id, chair_id)
);

-- 4. The round of each vehicle: ordered, timed stops, each with people in charge.
CREATE TABLE IF NOT EXISTS trip_stop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_vehicle_id uuid NOT NULL REFERENCES trip_vehicle(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('pickup_vehicle', 'load_equipment', 'pick_passengers', 'drive', 'arrive', 'reload', 'unload', 'return_vehicle', 'other')),
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 160),
  place_id uuid REFERENCES calendar_place(id),
  shared_venue_id uuid REFERENCES shared_venue(id),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  at timestamptz,
  minutes integer CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 2000),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500)
);
CREATE INDEX IF NOT EXISTS trip_stop_vehicle ON trip_stop(trip_vehicle_id, position);
CREATE TABLE IF NOT EXISTS trip_stop_person (
  stop_id uuid NOT NULL REFERENCES trip_stop(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES club_person(id),
  PRIMARY KEY (stop_id, profile_id)
);
