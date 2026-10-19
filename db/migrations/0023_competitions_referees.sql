-- Matches of a club team (championship, cup, tournament or friendly).
-- The opponent is a name: it may be a club of the app or an outside team.
CREATE TABLE match (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organization(id),
 team_id uuid NOT NULL, opponent text NOT NULL CHECK(length(trim(opponent)) BETWEEN 2 AND 120),
 home boolean NOT NULL DEFAULT true,
 kind text NOT NULL CHECK(kind IN ('league','cup','tournament','friendly')),
 competition text NOT NULL DEFAULT '' CHECK(length(competition)<=120),
 starts_at timestamptz NOT NULL, venue text NOT NULL DEFAULT '' CHECK(length(venue)<=200),
 calendar_event_id uuid,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','played','postponed','cancelled')),
 our_score integer CHECK(our_score BETWEEN 0 AND 99), their_score integer CHECK(their_score BETWEEN 0 AND 99),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 version integer NOT NULL DEFAULT 1, created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(team_id,organization_id) REFERENCES team(id,organization_id),
 FOREIGN KEY(calendar_event_id,organization_id) REFERENCES calendar_event(id,organization_id),
 CHECK(status<>'played' OR (our_score IS NOT NULL AND their_score IS NOT NULL)),
 UNIQUE(id,organization_id)
);
CREATE INDEX match_team ON match(organization_id,team_id,starts_at);

-- Line-up and individual statistics of one match.
CREATE TABLE match_player (
 match_id uuid NOT NULL, organization_id uuid NOT NULL, profile_id uuid NOT NULL,
 starter boolean NOT NULL DEFAULT false, position text NOT NULL DEFAULT '' CHECK(length(position)<=40),
 jersey_number integer CHECK(jersey_number BETWEEN 0 AND 99),
 minutes integer NOT NULL DEFAULT 0 CHECK(minutes BETWEEN 0 AND 200),
 goals integer NOT NULL DEFAULT 0 CHECK(goals BETWEEN 0 AND 50),
 assists integer NOT NULL DEFAULT 0 CHECK(assists BETWEEN 0 AND 50),
 yellow_cards integer NOT NULL DEFAULT 0 CHECK(yellow_cards BETWEEN 0 AND 2),
 red_card boolean NOT NULL DEFAULT false,
 PRIMARY KEY(match_id,profile_id),
 FOREIGN KEY(match_id,organization_id) REFERENCES match(id,organization_id),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id)
);
CREATE INDEX match_player_profile ON match_player(organization_id,profile_id);

-- Referees (role "referee" in a federation): availability, designations, reports.
CREATE TABLE referee_availability (
 federation_id uuid NOT NULL REFERENCES organization(id), user_id text NOT NULL REFERENCES "user"(id),
 day date NOT NULL, available boolean NOT NULL, note text NOT NULL DEFAULT '' CHECK(length(note)<=200),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(federation_id,user_id,day)
);
CREATE TABLE referee_assignment (
 match_id uuid NOT NULL REFERENCES match(id), federation_id uuid NOT NULL REFERENCES organization(id),
 referee_id text NOT NULL REFERENCES "user"(id),
 role text NOT NULL DEFAULT 'main' CHECK(role IN ('main','assistant','table')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','declined','withdrawn')),
 assigned_by text NOT NULL REFERENCES "user"(id), assigned_at timestamptz NOT NULL DEFAULT now(), answered_at timestamptz,
 PRIMARY KEY(match_id,referee_id)
);
CREATE INDEX referee_assignment_referee ON referee_assignment(referee_id,status);
CREATE TABLE match_report (
 match_id uuid PRIMARY KEY REFERENCES match(id), referee_id text NOT NULL REFERENCES "user"(id),
 home_score integer NOT NULL CHECK(home_score BETWEEN 0 AND 99), away_score integer NOT NULL CHECK(away_score BETWEEN 0 AND 99),
 incidents text NOT NULL DEFAULT '' CHECK(length(incidents)<=4000),
 submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_template DROP CONSTRAINT notification_template_kind_check;
ALTER TABLE notification_template ADD CONSTRAINT notification_template_kind_check CHECK(kind IN ('invitation','access_changed','team_assignment','family_access','test_self','registration_update','document_update','calendar_update','attendance_update','dues_reminder','document_reminder','training_update','match_update'));
ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK(resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match'));
