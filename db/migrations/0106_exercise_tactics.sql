-- 4: exercise and tactic sheets. The fixed list becomes the « Type » (the
-- column keeps its name); a free « Objectif »; a genre (exercise or tactic);
-- the creator kept after a copy; the club's tags; the drawn pitch; tactics
-- attached to a match; the federal library (a club proposes, the federation
-- validates, every club of the federation copies).
ALTER TABLE exercise
  ADD COLUMN IF NOT EXISTS goal text NOT NULL DEFAULT '' CHECK (length(goal) <= 500),
  ADD COLUMN IF NOT EXISTS genre text NOT NULL DEFAULT 'exercise' CHECK (genre IN ('exercise', 'tactic')),
  ADD COLUMN IF NOT EXISTS origin_exercise_id uuid,
  ADD COLUMN IF NOT EXISTS origin_author text NOT NULL DEFAULT '' CHECK (length(origin_author) <= 200),
  ADD COLUMN IF NOT EXISTS origin_club text NOT NULL DEFAULT '' CHECK (length(origin_club) <= 200),
  ADD COLUMN IF NOT EXISTS federal_status text NOT NULL DEFAULT 'private' CHECK (federal_status IN ('private', 'pending', 'published', 'refused')),
  ADD COLUMN IF NOT EXISTS federal_reason text NOT NULL DEFAULT '' CHECK (length(federal_reason) <= 1000),
  ADD COLUMN IF NOT EXISTS federal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS federal_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS federal_decided_by text REFERENCES "user"(id);
CREATE INDEX IF NOT EXISTS exercise_federal_pending ON exercise(federal_status) WHERE federal_status = 'pending';

-- The club's tags, shared by its coaches; the colour is one of the chart
-- variables (c1 to c8), never a free colour.
CREATE TABLE IF NOT EXISTS exercise_tag (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
 color text NOT NULL DEFAULT 'c1' CHECK (color IN ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8')),
 created_by text REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS exercise_tag_name ON exercise_tag(organization_id, lower(name));
CREATE TABLE IF NOT EXISTS exercise_tag_link (
 exercise_id uuid NOT NULL,
 tag_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 PRIMARY KEY (exercise_id, tag_id),
 FOREIGN KEY (exercise_id, organization_id) REFERENCES exercise(id, organization_id),
 FOREIGN KEY (tag_id, organization_id) REFERENCES exercise_tag(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS exercise_tag_link_tag ON exercise_tag_link(tag_id);
-- The free tags of before become the club's tags, then the array is emptied
-- so a second run creates nothing again.
INSERT INTO exercise_tag(organization_id, name, color)
SELECT DISTINCT ON (x.organization_id, lower(trim(t))) x.organization_id, left(trim(t), 30), 'c1'
  FROM exercise x CROSS JOIN LATERAL unnest(x.tags) AS t
 WHERE length(trim(t)) > 0
ON CONFLICT DO NOTHING;
INSERT INTO exercise_tag_link(exercise_id, tag_id, organization_id)
SELECT DISTINCT x.id, g.id, x.organization_id
  FROM exercise x CROSS JOIN LATERAL unnest(x.tags) AS t
  JOIN exercise_tag g ON g.organization_id = x.organization_id AND lower(g.name) = lower(left(trim(t), 30))
ON CONFLICT DO NOTHING;
UPDATE exercise SET tags = '{}' WHERE cardinality(tags) > 0;

-- The drawn pitch: situations and their objects, in JSON (256 kB at most).
CREATE TABLE IF NOT EXISTS exercise_drawing (
 exercise_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 content jsonb NOT NULL CHECK (octet_length(content::text) <= 262144),
 updated_by text NOT NULL REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (exercise_id, organization_id) REFERENCES exercise(id, organization_id)
);

-- The tactics of a match; the coach's notes stay with the staff.
CREATE TABLE IF NOT EXISTS match_tactic (
 match_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 exercise_id uuid NOT NULL,
 position integer NOT NULL DEFAULT 0,
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 added_by text NOT NULL REFERENCES "user"(id),
 added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (match_id, exercise_id),
 FOREIGN KEY (match_id, organization_id) REFERENCES match(id, organization_id),
 FOREIGN KEY (exercise_id, organization_id) REFERENCES exercise(id, organization_id)
);
CREATE INDEX IF NOT EXISTS match_tactic_exercise ON match_tactic(exercise_id);

-- The federal library: a snapshot of a validated sheet, or one the
-- federation wrote. Private notes never travel.
CREATE TABLE IF NOT EXISTS federal_exercise (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 federation_id uuid NOT NULL REFERENCES organization(id),
 source_exercise_id uuid UNIQUE REFERENCES exercise(id) ON DELETE SET NULL,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
 genre text NOT NULL CHECK (genre IN ('exercise', 'tactic')),
 objective text NOT NULL CHECK (objective IN ('technique', 'tactics', 'driving', 'warmup', 'game', 'other')),
 goal text NOT NULL DEFAULT '' CHECK (length(goal) <= 500),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
 safety text NOT NULL DEFAULT '' CHECK (length(safety) <= 2000),
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 180),
 players_min integer NOT NULL CHECK (players_min BETWEEN 1 AND 40),
 players_max integer NOT NULL CHECK (players_max BETWEEN 1 AND 40),
 level text NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
 suited text NOT NULL CHECK (suited IN ('PF1', 'PF2', 'both')),
 equipment text NOT NULL DEFAULT '' CHECK (length(equipment) <= 1000),
 variants text NOT NULL DEFAULT '' CHECK (length(variants) <= 3000),
 video_url text NOT NULL DEFAULT '',
 tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 10),
 drawing jsonb CHECK (drawing IS NULL OR octet_length(drawing::text) <= 262144),
 diagram_type text CHECK (diagram_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
 diagram bytea CHECK (diagram IS NULL OR octet_length(diagram) <= 2097152),
 origin_author text NOT NULL CHECK (length(origin_author) <= 200),
 origin_club text NOT NULL CHECK (length(origin_club) <= 200),
 status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'withdrawn')),
 published_by text NOT NULL REFERENCES "user"(id),
 published_at timestamptz NOT NULL DEFAULT now(),
 CHECK (players_min <= players_max)
);
CREATE INDEX IF NOT EXISTS federal_exercise_federation ON federal_exercise(federation_id) WHERE status = 'published';
-- « Copiée par N clubs »: one line per club, whatever the number of copies.
CREATE TABLE IF NOT EXISTS federal_exercise_copy (
 federal_exercise_id uuid NOT NULL REFERENCES federal_exercise(id),
 organization_id uuid NOT NULL REFERENCES organization(id),
 first_copied_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (federal_exercise_id, organization_id)
);
