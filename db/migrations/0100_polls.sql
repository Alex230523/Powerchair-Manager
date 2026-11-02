-- H3: mini polls for the club and the federation. A choice of dates (yes,
-- if need be, no), one choice or several; answers anonymous or not; a
-- closing date. Each recipient has a personal link that works once without
-- signing in (only its hash is kept). Additive.
CREATE TABLE IF NOT EXISTS poll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  kind text NOT NULL CHECK (kind IN ('dates', 'single', 'multiple')),
  question text NOT NULL CHECK (length(trim(question)) BETWEEN 3 AND 200),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 1000),
  anonymous boolean NOT NULL DEFAULT false,
  audience text NOT NULL CHECK (audience IN ('team', 'team_parents', 'coaches', 'staff', 'members', 'presidents')),
  team_id uuid,
  per_child boolean NOT NULL DEFAULT false,
  closes_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  source_event_id uuid,
  outcome_event_id uuid,
  outcome_task_id uuid,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id),
  CHECK ((audience IN ('team', 'team_parents')) = (team_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS poll_org ON poll(organization_id, created_at DESC);
CREATE TABLE IF NOT EXISTS poll_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 30),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  starts_at timestamptz,
  UNIQUE (poll_id, position)
);
-- One line per answer expected: a person, or a parent for one child.
CREATE TABLE IF NOT EXISTS poll_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  profile_id uuid,
  token_hash text NOT NULL UNIQUE,
  answered_at timestamptz,
  link_used_at timestamptz,
  reminded_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (poll_id, user_id, profile_id)
);
CREATE TABLE IF NOT EXISTS poll_answer (
  recipient_id uuid NOT NULL REFERENCES poll_recipient(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES poll_option(id) ON DELETE CASCADE,
  value text NOT NULL CHECK (value IN ('yes', 'maybe', 'no')),
  PRIMARY KEY (recipient_id, option_id)
);
