-- Parcours d'accueil (onboarding): journeys of steps given to a newcomer
-- by his club or his federation, each step reusing what exists (the guided
-- tour, the to-do, documents, the profile). Additive. A journey never gives
-- any right: it only uses what the person's role already allows.

-- 6. The guided tour gets a referee's version.
ALTER TABLE user_tutorial DROP CONSTRAINT IF EXISTS user_tutorial_audience_check;
ALTER TABLE user_tutorial ADD CONSTRAINT user_tutorial_audience_check CHECK (audience IN ('coach', 'player', 'parent', 'referee'));

-- 1. A template: audience, trigger, ordered steps (in jsonb, written in three languages).
CREATE TABLE IF NOT EXISTS onboarding_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  audience text NOT NULL CHECK (audience IN ('coach', 'player', 'guardian', 'referee', 'federation_worker')),
  trigger text NOT NULL DEFAULT 'invitation' CHECK (trigger IN ('invitation', 'manual')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_template_name ON onboarding_template(organization_id, lower(trim(name))) WHERE NOT archived;

-- 3. A journey given to one person, and its steps with their deadlines.
CREATE TABLE IF NOT EXISTS onboarding_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  template_id uuid NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id),
  profile_id uuid REFERENCES club_person(id),
  name text NOT NULL,
  started_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_id, organization_id) REFERENCES onboarding_template(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_run_once ON onboarding_run(organization_id, template_id, user_id) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS onboarding_step (
  run_id uuid NOT NULL REFERENCES onboarding_run(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 40),
  position integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('message', 'read', 'sign', 'profile', 'upload', 'training', 'task', 'meeting', 'tour')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT true,
  due_on date NOT NULL,
  task_id uuid REFERENCES task(id) ON DELETE SET NULL,
  document_id uuid,
  done_at timestamptz,
  done_how text CHECK (done_how IS NULL OR done_how IN ('auto', 'self', 'club')),
  signed_name text,
  reminded_on date,
  PRIMARY KEY (run_id, key)
);
