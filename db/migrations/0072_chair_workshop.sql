-- B3: the chairs' workshop. An intervention log, the chair's warranty and
-- funding, batteries and chargers as components, speed checks before
-- competition, chairs booked for an event, breakdowns reported from a phone.

-- 1. The chair: warranty, funding (a grant was already there), statuses « hors service » and « prêté ».
ALTER TABLE equipment_chair ADD COLUMN IF NOT EXISTS warranty_until date;
ALTER TABLE equipment_chair ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partner(id);
ALTER TABLE equipment_chair ADD COLUMN IF NOT EXISTS pot_id uuid REFERENCES fundraising_pot(id);
ALTER TABLE equipment_chair DROP CONSTRAINT IF EXISTS equipment_chair_status_check;
ALTER TABLE equipment_chair ADD CONSTRAINT equipment_chair_status_check CHECK (status IN ('available', 'in_use', 'maintenance', 'out_of_service', 'lent', 'retired'));

-- 2. The rules of the club for speed checks: the limit (10 km/h, FIPFA) and how old a check may be.
ALTER TABLE organization ADD COLUMN IF NOT EXISTS chair_speed_limit_kmh numeric(3,1) NOT NULL DEFAULT 10;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS speed_check_days integer NOT NULL DEFAULT 180;
DO $$ BEGIN
  ALTER TABLE organization ADD CONSTRAINT organization_speed_rules_check CHECK (chair_speed_limit_kmh BETWEEN 1 AND 20 AND speed_check_days BETWEEN 7 AND 730);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. The log of each chair: never erased, a mistake is cancelled with a reason.
CREATE TABLE IF NOT EXISTS chair_intervention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  chair_id uuid NOT NULL,
  occurred_on date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('service', 'breakdown', 'repair', 'battery', 'adjustment', 'speed_check')),
  diagnosis text NOT NULL DEFAULT '' CHECK (length(diagnosis) <= 1000),
  parts text NOT NULL DEFAULT '' CHECK (length(parts) <= 500),
  supplier_contact_id uuid,
  cost_cents integer CHECK (cost_cents IS NULL OR cost_cents BETWEEN 0 AND 100000000),
  days_out integer NOT NULL DEFAULT 0 CHECK (days_out BETWEEN 0 AND 3650),
  -- The invoice is a line of the club's finances, linked once, never copied.
  transaction_id uuid UNIQUE,
  speed_kmh numeric(3,1) CHECK (speed_kmh IS NULL OR speed_kmh BETWEEN 0 AND 30),
  checker text NOT NULL DEFAULT '' CHECK (length(checker) <= 120),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancel_reason text,
  FOREIGN KEY (chair_id, organization_id) REFERENCES equipment_chair(id, organization_id),
  CHECK (kind <> 'speed_check' OR speed_kmh IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS chair_intervention_chair ON chair_intervention(chair_id, occurred_on DESC);

-- 4. Batteries and chargers, followed one by one.
CREATE TABLE IF NOT EXISTS chair_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('battery', 'charger')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  serial text NOT NULL DEFAULT '' CHECK (length(serial) <= 80),
  in_service_on date,
  chair_id uuid,
  retired_on date,
  replaced_by uuid REFERENCES chair_component(id),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (chair_id, organization_id) REFERENCES equipment_chair(id, organization_id)
);
CREATE INDEX IF NOT EXISTS chair_component_chair ON chair_component(chair_id) WHERE retired_on IS NULL;

-- 5. A club chair booked for a player at an event; one chair, one player, per event.
CREATE TABLE IF NOT EXISTS chair_booking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  chair_id uuid NOT NULL,
  event_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'released')),
  released_reason text NOT NULL DEFAULT '' CHECK (length(released_reason) <= 200),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (chair_id, organization_id) REFERENCES equipment_chair(id, organization_id),
  FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS chair_booking_chair ON chair_booking(chair_id, event_id) WHERE status = 'booked';
CREATE UNIQUE INDEX IF NOT EXISTS chair_booking_player ON chair_booking(event_id, profile_id) WHERE status = 'booked';

-- 6. A breakdown reported from a phone (player, parent, coach), with its photo.
CREATE TABLE IF NOT EXISTS chair_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  chair_id uuid NOT NULL,
  reporter_id text NOT NULL REFERENCES "user"(id),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 1000),
  photo bytea,
  photo_type text CHECK (photo_type IS NULL OR photo_type IN ('image/jpeg', 'image/png', 'image/webp')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by text REFERENCES "user"(id),
  FOREIGN KEY (chair_id, organization_id) REFERENCES equipment_chair(id, organization_id),
  CHECK (photo IS NULL OR octet_length(photo) <= 1048576)
);
CREATE INDEX IF NOT EXISTS chair_report_open ON chair_report(organization_id) WHERE status = 'open';
