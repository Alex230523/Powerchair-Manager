-- 8 (part 2): the start-of-season check. Each autonomous adult player and
-- each legal representative confirms, once a season, that the data of the
-- people in their care are still right. « Me le rappeler plus tard » once;
-- after the delay the screen comes back at each sign-in (never blocking).
-- (0080 is kept for the removal of the messaging's tables, 24.)
CREATE TABLE IF NOT EXISTS season_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  season_id uuid NOT NULL,
  launched_at timestamptz NOT NULL DEFAULT now(),
  launched_by text REFERENCES "user"(id),
  grace_days integer NOT NULL DEFAULT 14 CHECK (grace_days BETWEEN 1 AND 90),
  UNIQUE (organization_id, season_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id)
);
CREATE TABLE IF NOT EXISTS season_check_answer (
  check_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  verified_at timestamptz,
  verified_by text REFERENCES "user"(id),
  postponed_at timestamptz,
  postponed_by text REFERENCES "user"(id),
  reminded_at timestamptz,
  PRIMARY KEY (check_id, profile_id),
  FOREIGN KEY (check_id, organization_id) REFERENCES season_check(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);
