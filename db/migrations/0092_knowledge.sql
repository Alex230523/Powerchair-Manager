-- Knowledge centre (the guide grown): the federation's lexicon, its gallery
-- of photos and annotated diagrams, a quiz per rules chapter, and a sheet
-- per chair model (photos, maker, suppliers, price, features). Additive.

-- G12: the lexicon, a short definition per term, in three languages.
CREATE TABLE IF NOT EXISTS guide_term (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  term jsonb NOT NULL CHECK (length(term->>'fr') BETWEEN 1 AND 60),
  definition jsonb NOT NULL CHECK (length(definition->>'fr') BETWEEN 3 AND 300),
  position integer NOT NULL DEFAULT 0,
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guide_term_once ON guide_term(federation_id, lower(term->>'fr'));

-- G5: photos and diagrams; a text alternative always, the image rights of any person seen.
CREATE TABLE IF NOT EXISTS guide_image (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  category text NOT NULL CHECK (category IN ('court', 'goals', 'ball', 'guard', 'speed', 'chair', 'other')),
  conform text CHECK (conform IS NULL OR conform IN ('yes', 'no')),
  alt jsonb NOT NULL CHECK (length(alt->>'fr') BETWEEN 5 AND 300),
  caption jsonb NOT NULL DEFAULT '{}',
  people_visible boolean NOT NULL DEFAULT false,
  image_rights boolean NOT NULL DEFAULT false,
  media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT people_visible OR image_rights)
);
CREATE INDEX IF NOT EXISTS guide_image_federation ON guide_image(federation_id, category);

-- G7: five questions per rules chapter; a pass is kept only to tick a welcome journey's step.
CREATE TABLE IF NOT EXISTS guide_quiz (
  chapter_id uuid PRIMARY KEY REFERENCES guide_chapter(id) ON DELETE CASCADE,
  questions jsonb NOT NULL,
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS guide_quiz_pass (
  chapter_id uuid NOT NULL REFERENCES guide_chapter(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id),
  passed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chapter_id, user_id)
);

-- G4: the catalogue of chairs, one sheet per model and federation.
CREATE TABLE IF NOT EXISTS chair_model_sheet (
  model_id uuid NOT NULL REFERENCES chair_model(id),
  federation_id uuid NOT NULL REFERENCES organization(id),
  manufacturer text NOT NULL DEFAULT '' CHECK (length(manufacturer) <= 120),
  price_cents integer CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 10000000),
  price_on date,
  speed_kmh numeric(4, 1) CHECK (speed_kmh IS NULL OR speed_kmh BETWEEN 0 AND 30),
  weight_kg numeric(5, 1) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0 AND 500),
  protections jsonb NOT NULL DEFAULT '{}',
  strengths jsonb NOT NULL DEFAULT '{}',
  limits jsonb NOT NULL DEFAULT '{}',
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, federation_id),
  CHECK (price_cents IS NULL OR price_on IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS chair_model_supplier (
  model_id uuid NOT NULL REFERENCES chair_model(id),
  federation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  PRIMARY KEY (model_id, federation_id, contact_id),
  FOREIGN KEY (contact_id, federation_id) REFERENCES contact(id, organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chair_model_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES chair_model(id),
  federation_id uuid NOT NULL REFERENCES organization(id),
  alt jsonb NOT NULL CHECK (length(alt->>'fr') BETWEEN 5 AND 300),
  media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  position integer NOT NULL DEFAULT 0,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chair_model_photo_model ON chair_model_photo(model_id, federation_id, position);
