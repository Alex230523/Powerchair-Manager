-- Equipment (cahier des charges, module 15): sport powerchairs and the players who use them.
-- A chair can be linked to several players (shared club chair) and a player to several chairs.
CREATE TABLE equipment_chair (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),
 brand text NOT NULL DEFAULT '' CHECK(length(brand)<=80), model text NOT NULL DEFAULT '' CHECK(length(model)<=80),
 serial_number text NOT NULL DEFAULT '' CHECK(length(serial_number)<=80),
 ownership text NOT NULL DEFAULT 'club' CHECK(ownership IN ('club','player','loan')),
 status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','in_use','maintenance','retired')),
 max_speed_kmh numeric(3,1) CHECK(max_speed_kmh IS NULL OR max_speed_kmh BETWEEN 0 AND 20),
 battery text NOT NULL DEFAULT '' CHECK(length(battery)<=120),
 acquired_on date, last_service_on date, next_service_on date,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX equipment_chair_name ON equipment_chair(organization_id,lower(trim(name))) WHERE status<>'retired';
CREATE TABLE equipment_chair_assignment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, chair_id uuid NOT NULL, profile_id uuid NOT NULL,
 is_primary boolean NOT NULL DEFAULT false, starts_on date NOT NULL DEFAULT CURRENT_DATE, ends_on date,
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(chair_id,organization_id) REFERENCES equipment_chair(id,organization_id),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id),
 CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE UNIQUE INDEX equipment_one_open_link ON equipment_chair_assignment(chair_id,profile_id) WHERE ends_on IS NULL;
CREATE INDEX equipment_assignment_profile ON equipment_chair_assignment(organization_id,profile_id);
CREATE TABLE equipment_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 chair_id uuid NOT NULL REFERENCES equipment_chair(id), actor_id text NOT NULL REFERENCES "user"(id),
 action text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage']::text[]);
