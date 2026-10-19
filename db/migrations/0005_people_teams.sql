-- Identities may exist without a login. Club-private data never lives on person.
ALTER TABLE person ALTER COLUMN user_id DROP NOT NULL;
CREATE TABLE club_person (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 person_id uuid NOT NULL REFERENCES person(id), full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 120),
 birth_date date, email text, phone text NOT NULL DEFAULT '', joined_on date NOT NULL DEFAULT CURRENT_DATE,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived','transferred')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 CHECK(birth_date IS NULL OR birth_date<=CURRENT_DATE),
 UNIQUE(organization_id,person_id),UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX club_person_duplicate ON club_person(organization_id,lower(trim(full_name)),birth_date) NULLS NOT DISTINCT;
CREATE TABLE season (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 80),starts_on date NOT NULL,ends_on date NOT NULL,
 archived boolean NOT NULL DEFAULT false,CHECK(ends_on>=starts_on),UNIQUE(organization_id,name),UNIQUE(id,organization_id)
);
CREATE TABLE team (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organization(id),season_id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 100),category text NOT NULL DEFAULT '',level text NOT NULL DEFAULT '',home_location text NOT NULL DEFAULT '',
 archived boolean NOT NULL DEFAULT false,FOREIGN KEY(season_id,organization_id) REFERENCES season(id,organization_id),
 UNIQUE(organization_id,season_id,name),UNIQUE(id,organization_id)
);
CREATE TABLE team_membership (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,team_id uuid NOT NULL,profile_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('player','coach','assistant','volunteer')),position text NOT NULL DEFAULT '',
 starts_on date NOT NULL DEFAULT CURRENT_DATE,ends_on date,cancelled boolean NOT NULL DEFAULT false,
 FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id),
 CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE UNIQUE INDEX one_current_team_role ON team_membership(team_id,profile_id,role) WHERE ends_on IS NULL;
ALTER TABLE role_assignment ADD COLUMN team_id uuid;
ALTER TABLE role_assignment ADD FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id);
ALTER TABLE role_assignment ADD CONSTRAINT team_scoped_coach CHECK(team_id IS NULL OR role='coach');
CREATE TABLE guardian_relationship (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,guardian_profile_id uuid NOT NULL,subject_profile_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('declared','legal_verified','delegated_aid')),
 can_view boolean NOT NULL DEFAULT false,can_edit boolean NOT NULL DEFAULT false,
 starts_on date NOT NULL DEFAULT CURRENT_DATE,ends_on date,revoked_at timestamptz,
 authorization_note text NOT NULL DEFAULT '',verified_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(guardian_profile_id,organization_id) REFERENCES club_person(id,organization_id),
 FOREIGN KEY(subject_profile_id,organization_id) REFERENCES club_person(id,organization_id),
 CHECK(guardian_profile_id<>subject_profile_id),CHECK(ends_on IS NULL OR ends_on>=starts_on),
 CHECK(NOT can_edit OR can_view),CHECK(kind<>'declared' OR (NOT can_view AND NOT can_edit)),
 CHECK((NOT can_view AND NOT can_edit) OR length(trim(authorization_note))>=5),
 CHECK(kind<>'delegated_aid' OR NOT can_view OR ends_on IS NOT NULL)
);
CREATE UNIQUE INDEX one_current_guardian_relation ON guardian_relationship(organization_id,guardian_profile_id,subject_profile_id) WHERE revoked_at IS NULL;
CREATE TABLE person_transfer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_organization_id uuid NOT NULL,source_profile_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',created_by text NOT NULL REFERENCES "user"(id),
 authorization_note text NOT NULL CHECK(length(trim(authorization_note))>=5),
 accepted_at timestamptz,target_organization_id uuid REFERENCES organization(id),revoked_at timestamptz,
 FOREIGN KEY(source_profile_id,source_organization_id) REFERENCES club_person(id,organization_id)
);
-- New capabilities are explicitly delegable; the seven base roles are unchanged.
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage']::text[]);
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage']::text[]);
