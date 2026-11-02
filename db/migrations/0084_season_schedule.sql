-- H9: the typical season in one go. Reference school holidays per school
-- year (French-speaking community « fwb », Flemish community « vl »): the
-- official dates given here (organization_id NULL), those a federation sets
-- for its clubs, and a club's own corrections (« overrides » replaces or,
-- with « hidden », removes a reference line). The club's reference (fwb, vl
-- or both), closures of a place or of the club, and the season's planned
-- slots (one series each, never created twice).
CREATE TABLE IF NOT EXISTS school_holiday (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization(id),
  community text NOT NULL CHECK (community IN ('fwb', 'vl')),
  school_year text NOT NULL CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  source text NOT NULL DEFAULT '' CHECK (length(source) <= 300),
  overrides uuid REFERENCES school_holiday(id),
  hidden boolean NOT NULL DEFAULT false,
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS school_holiday_reference ON school_holiday(community, school_year, name) WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS school_holiday_org ON school_holiday(organization_id, community, starts_on);

INSERT INTO school_holiday(community, school_year, name, starts_on, ends_on, source)
SELECT v.community, v.school_year, v.name, v.starts_on::date, v.ends_on::date, v.source
  FROM (VALUES
    ('fwb', '2025-2026', 'Congé d''automne', '2025-10-20', '2025-11-02', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2025-2026'),
    ('fwb', '2025-2026', 'Vacances d''hiver', '2025-12-22', '2026-01-04', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2025-2026'),
    ('fwb', '2025-2026', 'Congé de détente', '2026-02-16', '2026-03-01', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2025-2026'),
    ('fwb', '2025-2026', 'Vacances de printemps', '2026-04-27', '2026-05-10', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2025-2026'),
    ('fwb', '2025-2026', 'Vacances d''été', '2026-07-04', '2026-08-23', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2025-2026'),
    ('fwb', '2026-2027', 'Congé d''automne', '2026-10-19', '2026-11-01', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2026-2027'),
    ('fwb', '2026-2027', 'Vacances d''hiver', '2026-12-21', '2027-01-03', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2026-2027'),
    ('fwb', '2026-2027', 'Congé de détente', '2027-02-22', '2027-03-07', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2026-2027'),
    ('fwb', '2026-2027', 'Vacances de printemps', '2027-04-26', '2027-05-09', 'Fédération Wallonie-Bruxelles, calendrier scolaire 2026-2027'),
    ('vl', '2025-2026', 'Herfstvakantie', '2025-10-27', '2025-11-02', 'vlaanderen.be, schoolvakanties 2025-2026'),
    ('vl', '2025-2026', 'Kerstvakantie', '2025-12-22', '2026-01-04', 'vlaanderen.be, schoolvakanties 2025-2026'),
    ('vl', '2025-2026', 'Krokusvakantie', '2026-02-16', '2026-02-22', 'vlaanderen.be, schoolvakanties 2025-2026'),
    ('vl', '2025-2026', 'Paasvakantie', '2026-04-06', '2026-04-19', 'vlaanderen.be, schoolvakanties 2025-2026'),
    ('vl', '2025-2026', 'Hemelvaart', '2026-05-14', '2026-05-15', 'vlaanderen.be, schoolvakanties 2025-2026'),
    ('vl', '2025-2026', 'Zomervakantie', '2026-07-01', '2026-08-31', 'vlaanderen.be, schoolvakanties 2025-2026'),
    ('vl', '2026-2027', 'Herfstvakantie', '2026-11-02', '2026-11-08', 'vlaanderen.be, schoolvakanties 2026-2027'),
    ('vl', '2026-2027', 'Kerstvakantie', '2026-12-21', '2027-01-03', 'vlaanderen.be, schoolvakanties 2026-2027'),
    ('vl', '2026-2027', 'Krokusvakantie', '2027-02-08', '2027-02-14', 'vlaanderen.be, schoolvakanties 2026-2027'),
    ('vl', '2026-2027', 'Paasvakantie', '2027-03-29', '2027-04-11', 'vlaanderen.be, schoolvakanties 2026-2027'),
    ('vl', '2026-2027', 'Hemelvaart', '2027-05-06', '2027-05-07', 'vlaanderen.be, schoolvakanties 2026-2027'),
    ('vl', '2026-2027', 'Zomervakantie', '2027-07-01', '2027-08-31', 'vlaanderen.be, schoolvakanties 2026-2027')
  ) AS v(community, school_year, name, starts_on, ends_on, source)
 WHERE NOT EXISTS (SELECT 1 FROM school_holiday h WHERE h.organization_id IS NULL AND h.community = v.community AND h.school_year = v.school_year AND h.name = v.name);

ALTER TABLE organization ADD COLUMN IF NOT EXISTS holiday_reference text[] NOT NULL DEFAULT '{fwb}';
DO $$ BEGIN
  ALTER TABLE organization ADD CONSTRAINT organization_holiday_reference_check CHECK (holiday_reference <@ ARRAY['fwb', 'vl']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS club_closure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  place_id uuid REFERENCES calendar_place(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS club_closure_org ON club_closure(organization_id, starts_on);

CREATE TABLE IF NOT EXISTS season_slot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  season_id uuid NOT NULL,
  team_id uuid NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time text NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text NOT NULL CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, team_id, weekday, start_time),
  FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id),
  FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id)
);

-- H10: the keys and badges a coach or a member of staff holds.
CREATE TABLE IF NOT EXISTS staff_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  handed_on date,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  returned_on date,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
CREATE INDEX IF NOT EXISTS staff_key_profile ON staff_key(organization_id, profile_id) WHERE returned_on IS NULL;
