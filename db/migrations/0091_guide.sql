-- Guide du powerchair football: chapters written by a federation (versions
-- kept, drafts then published), read by its clubs' members, a club's own
-- note « Chez nous » under a chapter, readings (for the welcome journeys) and
-- a chair's « Conforme pour un match » check. Additive.

CREATE TABLE IF NOT EXISTS guide_chapter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  position integer NOT NULL DEFAULT 0,
  audiences text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- The public page (discovery days, new parents), only once published.
  public boolean NOT NULL DEFAULT false,
  current_version integer NOT NULL DEFAULT 1,
  published_version integer,
  updated_on date,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (federation_id, slug)
);
DO $$ BEGIN
  ALTER TABLE guide_chapter ADD CONSTRAINT guide_chapter_audiences_check CHECK (audiences <@ ARRAY['player', 'guardian', 'coach', 'staff', 'referee', 'president', 'federation']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every saved text is a version; the published one is pointed by the chapter.
CREATE TABLE IF NOT EXISTS guide_version (
  chapter_id uuid NOT NULL REFERENCES guide_chapter(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content jsonb NOT NULL,
  sources text NOT NULL DEFAULT '' CHECK (length(sources) <= 2000),
  author text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chapter_id, version)
);

CREATE TABLE IF NOT EXISTS guide_club_note (
  chapter_id uuid NOT NULL REFERENCES guide_chapter(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chapter_id, organization_id)
);

CREATE TABLE IF NOT EXISTS guide_read (
  chapter_id uuid NOT NULL REFERENCES guide_chapter(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id),
  version integer NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chapter_id, user_id)
);

-- « Conforme pour un match »: the lines of « Le fauteuil de match », checked at a service, dated.
CREATE TABLE IF NOT EXISTS chair_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  chair_id uuid NOT NULL,
  checked_on date NOT NULL,
  items text[] NOT NULL DEFAULT '{}',
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  checked_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (chair_id, organization_id) REFERENCES equipment_chair(id, organization_id)
);
DO $$ BEGIN
  ALTER TABLE chair_compliance ADD CONSTRAINT chair_compliance_items_check CHECK (items <@ ARRAY['guard', 'heights', 'width', 'belt', 'number', 'edges', 'speed']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS chair_compliance_chair ON chair_compliance(organization_id, chair_id, checked_on DESC);
