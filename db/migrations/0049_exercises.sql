-- Wave 16 (E2): the coaches' exercise sheets, reusable from one training to
-- the next. objective, level and suited (PF1, PF2 or both) are fixed lists;
-- shared: every coach of the club sees it, otherwise only its author.
CREATE TABLE exercise (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
 objective text NOT NULL CHECK (objective IN ('technique', 'tactics', 'driving', 'warmup', 'game', 'other')),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
 safety text NOT NULL DEFAULT '' CHECK (length(safety) <= 2000),
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 180),
 players_min integer NOT NULL DEFAULT 1 CHECK (players_min BETWEEN 1 AND 40),
 players_max integer NOT NULL DEFAULT 8 CHECK (players_max BETWEEN 1 AND 40),
 level text NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
 suited text NOT NULL CHECK (suited IN ('PF1', 'PF2', 'both')),
 equipment text NOT NULL DEFAULT '' CHECK (length(equipment) <= 1000),
 variants text NOT NULL DEFAULT '' CHECK (length(variants) <= 3000),
 video_url text NOT NULL DEFAULT '' CHECK (video_url = '' OR (video_url ~ '^https://' AND length(video_url) <= 500)),
 tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 10),
 author_id text NOT NULL REFERENCES "user"(id),
 shared boolean NOT NULL DEFAULT true,
 archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (players_min <= players_max),
 UNIQUE (id, organization_id)
);
CREATE INDEX exercise_org ON exercise(organization_id) WHERE NOT archived;
-- The diagram (image or PDF), kept apart so lists stay light (2 MB at most).
CREATE TABLE exercise_diagram (
 exercise_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
 content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
 updated_by text NOT NULL REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (exercise_id, organization_id) REFERENCES exercise(id, organization_id)
);
-- The programme of a training: exercises in order, planned minutes, the coach's notes.
CREATE TABLE calendar_event_exercise (
 event_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 exercise_id uuid NOT NULL,
 position integer NOT NULL DEFAULT 0,
 planned_minutes integer NOT NULL CHECK (planned_minutes BETWEEN 1 AND 180),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 PRIMARY KEY (event_id, exercise_id),
 FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id),
 FOREIGN KEY (exercise_id, organization_id) REFERENCES exercise(id, organization_id)
);
CREATE INDEX calendar_event_exercise_exercise ON calendar_event_exercise(exercise_id);
