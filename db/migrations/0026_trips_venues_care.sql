-- Wave 7: trips (tournaments, away matches, camps), adapted vehicles and
-- drivers, the shared accessible venue directory, care instructions and the
-- offline trip book.

-- Trips can be switched off like the other optional modules.
ALTER TABLE organization DROP CONSTRAINT organization_disabled_modules_check;
ALTER TABLE organization ADD CONSTRAINT organization_disabled_modules_check
  CHECK (disabled_modules <@ ARRAY['finance','dues','equipment','matches','licenses','reminders','messages','statistics','trips']::text[]);

-- Care instructions read during a trip are logged like other health data.
ALTER TABLE sensitive_access_log DROP CONSTRAINT sensitive_access_log_kind_check;
ALTER TABLE sensitive_access_log ADD CONSTRAINT sensitive_access_log_kind_check
  CHECK (kind IN ('player_health','registration_confidential','sensitive_document','offline_book','trip_care'));

-- The shared directory (visible to every club) learns accessibility, so a
-- team travelling away knows before leaving whether a hall really fits.
ALTER TABLE shared_venue
  ADD COLUMN city text NOT NULL DEFAULT '' CHECK (length(city) <= 120),
  ADD COLUMN phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 60),
  ADD COLUMN website text NOT NULL DEFAULT '' CHECK (length(website) <= 300),
  ADD COLUMN step_free boolean,
  ADD COLUMN adapted_toilets boolean,
  ADD COLUMN changing_rooms boolean,
  ADD COLUMN showers boolean,
  ADD COLUMN lift boolean,
  ADD COLUMN hoist boolean,
  ADD COLUMN parking boolean,
  ADD COLUMN charging boolean,
  ADD COLUMN door_width_cm integer CHECK (door_width_cm IS NULL OR door_width_cm BETWEEN 40 AND 400),
  ADD COLUMN floor text NOT NULL DEFAULT '' CHECK (length(floor) <= 120),
  ADD COLUMN court text NOT NULL DEFAULT '' CHECK (length(court) <= 200),
  ADD COLUMN notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  ADD COLUMN checked_on date,
  ADD COLUMN updated_by text REFERENCES "user"(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE shared_venue_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES shared_venue(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  actor_id text NOT NULL REFERENCES "user"(id),
  before_data jsonb,
  after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Club vehicles, with the places that matter for powerchair users.
CREATE TABLE club_vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  kind text NOT NULL DEFAULT '' CHECK (length(kind) <= 60),
  plate text NOT NULL DEFAULT '' CHECK (length(plate) <= 20),
  owner text NOT NULL DEFAULT '' CHECK (length(owner) <= 120),
  seats integer NOT NULL DEFAULT 0 CHECK (seats BETWEEN 0 AND 80),
  wheelchair_places integer NOT NULL DEFAULT 0 CHECK (wheelchair_places BETWEEN 0 AND 20),
  ramp_or_lift boolean NOT NULL DEFAULT false,
  licence text NOT NULL DEFAULT 'B' CHECK (licence IN ('B','BE','C1','D1','D')),
  insurance_until date,
  inspection_until date,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  archived boolean NOT NULL DEFAULT false,
  UNIQUE (id, organization_id)
);
-- Driving licences of the people who may drive for the club.
CREATE TABLE driver_licence (
  profile_id uuid PRIMARY KEY REFERENCES club_person(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  categories text[] NOT NULL DEFAULT '{}' CHECK (categories <@ ARRAY['B','BE','C1','D1','D']::text[]),
  valid_until date,
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
  kind text NOT NULL CHECK (kind IN ('tournament','away_match','camp','other')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','done','cancelled')),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  shared_venue_id uuid REFERENCES shared_venue(id),
  place_id uuid REFERENCES calendar_place(id),
  destination text NOT NULL DEFAULT '' CHECK (length(destination) <= 300),
  meeting_point text NOT NULL DEFAULT '' CHECK (length(meeting_point) <= 300),
  departure_at timestamptz,
  return_at timestamptz,
  return_point text NOT NULL DEFAULT '' CHECK (length(return_point) <= 300),
  accommodation text NOT NULL DEFAULT '' CHECK (length(accommodation) <= 1000),
  accommodation_accessible boolean,
  emergency text NOT NULL DEFAULT '' CHECK (length(emergency) <= 1000),
  contact text NOT NULL DEFAULT '' CHECK (length(contact) <= 200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  budget_cents integer NOT NULL DEFAULT 0 CHECK (budget_cents BETWEEN 0 AND 100000000),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (id, organization_id)
);
CREATE INDEX trip_org_dates ON trip(organization_id, starts_on);

CREATE TABLE trip_participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES club_person(id),
  role text NOT NULL CHECK (role IN ('player','coach','staff','assistant','guardian')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','confirmed','declined')),
  chair text NOT NULL DEFAULT 'none' CHECK (chair IN ('none','powerchair','manual','both')),
  needs text NOT NULL DEFAULT '' CHECK (length(needs) <= 500),
  UNIQUE (trip_id, profile_id)
);

CREATE TABLE trip_vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES club_vehicle(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  legs text NOT NULL DEFAULT 'both' CHECK (legs IN ('both','out','back')),
  driver_profile_id uuid REFERENCES club_person(id),
  driver_phone text NOT NULL DEFAULT '' CHECK (length(driver_phone) <= 60),
  seats integer NOT NULL DEFAULT 0 CHECK (seats BETWEEN 0 AND 80),
  wheelchair_places integer NOT NULL DEFAULT 0 CHECK (wheelchair_places BETWEEN 0 AND 20),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500)
);
CREATE TABLE trip_passenger (
  trip_vehicle_id uuid NOT NULL REFERENCES trip_vehicle(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES trip_participant(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_vehicle_id, participant_id)
);

CREATE TABLE trip_schedule_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  day date NOT NULL,
  time text NOT NULL DEFAULT '' CHECK (time = '' OR time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  place text NOT NULL DEFAULT '' CHECK (length(place) <= 200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500)
);
CREATE INDEX trip_schedule_day ON trip_schedule_item(trip_id, day, time);

CREATE TABLE trip_checklist_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 200),
  position integer NOT NULL DEFAULT 0,
  done_at timestamptz,
  done_by text REFERENCES "user"(id)
);

CREATE TABLE trip_budget_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  planned_cents integer NOT NULL CHECK (planned_cents BETWEEN 0 AND 100000000)
);
-- An expense or income of the ledger may belong to a trip (budget vs actual).
ALTER TABLE finance_transaction ADD COLUMN trip_id uuid REFERENCES trip(id);

-- Care instructions: what a player needs, when, during sessions and trips.
-- Title and details are sealed together (health data).
CREATE TABLE care_instruction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL REFERENCES club_person(id),
  moment text NOT NULL CHECK (moment IN ('morning','midday','evening','night','before_play','after_play','as_needed')),
  time text NOT NULL DEFAULT '' CHECK (time = '' OR time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ciphertext text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX care_instruction_profile ON care_instruction(profile_id) WHERE active;
-- Ticked during a trip, day by day, with who did it.
CREATE TABLE trip_care_done (
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  instruction_id uuid NOT NULL REFERENCES care_instruction(id),
  day date NOT NULL,
  done_at timestamptz NOT NULL DEFAULT now(),
  done_by text NOT NULL REFERENCES "user"(id),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  PRIMARY KEY (trip_id, instruction_id, day)
);
