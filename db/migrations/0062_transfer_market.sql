-- Wave 17 (J3): the transfer market between clubs of a federation.

-- 1. Consent: a player is shown to the other clubs only once the adult player,
--    or a parent for a minor, ticked « Visible par les autres clubs de la
--    fédération ». Per person (it follows the player from club to club, and
--    keeps a player without club visible if they chose so).
CREATE TABLE transfer_visibility (
  person_id uuid PRIMARY KEY REFERENCES person(id),
  visible boolean NOT NULL DEFAULT false,
  decided_by text NOT NULL REFERENCES "user"(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- 2. The province of a club, a filter of the market.
ALTER TABLE organization ADD COLUMN province text NOT NULL DEFAULT ''
  CHECK (province IN ('', 'antwerp', 'flemish_brabant', 'walloon_brabant', 'west_flanders', 'east_flanders', 'hainaut', 'liege', 'limburg', 'luxembourg', 'namur', 'brussels'));

-- 3. The federation's rules.
CREATE TABLE transfer_rules (
  federation_id uuid PRIMARY KEY REFERENCES organization(id),
  windows jsonb NOT NULL DEFAULT '[]',
  amounts_allowed boolean NOT NULL DEFAULT false,
  amount_cap_cents integer CHECK (amount_cap_cents IS NULL OR amount_cap_cents BETWEEN 0 AND 100000000),
  max_per_club_season integer CHECK (max_per_club_season IS NULL OR max_per_club_season BETWEEN 0 AND 100),
  federation_validation boolean NOT NULL DEFAULT true,
  rules_text text NOT NULL DEFAULT '' CHECK (length(rules_text) <= 5000),
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Offers. from_organization_id NULL: a player without club, whose last
--    profile (source) moves once the federation validates.
CREATE TABLE transfer_offer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  person_id uuid NOT NULL REFERENCES person(id),
  from_organization_id uuid REFERENCES organization(id),
  source_organization_id uuid NOT NULL,
  source_profile_id uuid NOT NULL,
  to_organization_id uuid NOT NULL REFERENCES organization(id),
  season text NOT NULL CHECK (season ~ '^[0-9]{4}-[0-9]{2}$'),
  amount_cents integer CHECK (amount_cents IS NULL OR amount_cents BETWEEN 0 AND 100000000),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 2000),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'discussing', 'accepted', 'refused', 'withdrawn', 'validated')),
  player_consent text NOT NULL DEFAULT 'pending' CHECK (player_consent IN ('pending', 'given', 'refused')),
  consent_by text REFERENCES "user"(id),
  consent_at timestamptz,
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 1000),
  federation_by text REFERENCES "user"(id),
  federation_at timestamptz,
  federation_note text NOT NULL DEFAULT '' CHECK (length(federation_note) <= 1000),
  completed_at timestamptz,
  target_profile_id uuid,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CHECK (from_organization_id IS NULL OR from_organization_id <> to_organization_id),
  FOREIGN KEY (source_profile_id, source_organization_id) REFERENCES club_person(id, organization_id)
);
CREATE UNIQUE INDEX transfer_offer_open ON transfer_offer(to_organization_id, person_id) WHERE status IN ('sent', 'discussing', 'accepted');
CREATE INDEX transfer_offer_from ON transfer_offer(from_organization_id, status);
CREATE INDEX transfer_offer_federation ON transfer_offer(federation_id, status);

-- 5. The conversation between the two clubs of an offer: a thread of its
--    own kind, read by the presidents and the people with the players right
--    of both clubs (computed at reading time, never a list of participants).
CREATE TABLE transfer_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES transfer_offer(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  sender_id text NOT NULL REFERENCES "user"(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transfer_message_offer ON transfer_message(offer_id, created_at);
