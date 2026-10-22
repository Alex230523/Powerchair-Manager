-- Wave 17 (J4): classification days organised by the federation. Invited
-- clubs register their players; on the day the federation or a classifier
-- marks who came and decides PF1, PF2 or « À revoir »; publishing updates
-- the player's sport profile (and its history) and tells the people concerned.
CREATE TABLE classification_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  day date NOT NULL,
  shared_venue_id uuid REFERENCES shared_venue(id),
  venue text NOT NULL DEFAULT '' CHECK (length(venue) <= 200),
  registration_deadline date NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'published', 'cancelled')),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (registration_deadline <= day)
);
CREATE INDEX classification_session_federation ON classification_session(federation_id, day);

CREATE TABLE classification_session_club (
  session_id uuid NOT NULL REFERENCES classification_session(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organization(id),
  PRIMARY KEY (session_id, organization_id)
);
CREATE INDEX classification_session_club_org ON classification_session_club(organization_id);

-- Classifiers: referees or people of the federation.
CREATE TABLE classification_session_classifier (
  session_id uuid NOT NULL REFERENCES classification_session(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE classification_session_player (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES classification_session(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  registered_by text NOT NULL REFERENCES "user"(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  present boolean,
  decision text CHECK (decision IS NULL OR decision IN ('PF1', 'PF2', 'review')),
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'decided', 'published')),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  UNIQUE (session_id, profile_id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id)
);

-- PF1 and PF2 explained in the federation's own words (fr, nl, en), shown in a tip on every badge.
ALTER TABLE organization ADD COLUMN classification_texts jsonb;
