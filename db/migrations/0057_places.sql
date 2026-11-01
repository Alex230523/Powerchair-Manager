-- Wave 17 (C4): places in two categories, a complete private sheet with dated
-- rates, and sharing validated by the federation.

-- « Entraînement et match » (a sports hall) or « Autre lieu » (premises,
-- restaurant, meeting room, lodging). The club's own home hall is marked.
ALTER TABLE calendar_place
  ADD COLUMN category text NOT NULL DEFAULT 'training' CHECK (category IN ('training', 'other')),
  ADD COLUMN contact_id uuid,
  ADD COLUMN food_policy text NOT NULL DEFAULT '' CHECK (length(food_policy) <= 1000),
  ADD COLUMN home boolean NOT NULL DEFAULT false,
  ADD COLUMN share_status text NOT NULL DEFAULT 'private' CHECK (share_status IN ('private', 'pending', 'approved', 'refused')),
  ADD COLUMN share_reason text NOT NULL DEFAULT '' CHECK (length(share_reason) <= 1000),
  ADD COLUMN share_requested_at timestamptz,
  ADD COLUMN share_decided_at timestamptz,
  ADD COLUMN share_decided_by text REFERENCES "user"(id),
  ADD COLUMN shared_venue_id uuid REFERENCES shared_venue(id);
ALTER TABLE calendar_place ADD CONSTRAINT calendar_place_contact FOREIGN KEY (contact_id, organization_id) REFERENCES contact(id, organization_id);
CREATE INDEX calendar_place_pending ON calendar_place(share_status) WHERE share_status = 'pending';

-- Rates stay private to the club; the history is kept, the current one is the latest valid.
CREATE TABLE venue_rate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  place_id uuid NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 100000000),
  unit text NOT NULL DEFAULT '' CHECK (length(unit) <= 40),
  valid_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES "user"(id),
  FOREIGN KEY (place_id, organization_id) REFERENCES calendar_place(id, organization_id)
);
CREATE INDEX venue_rate_place ON venue_rate(place_id, valid_from DESC);

-- The shared directory: halls already shared count as validated; the
-- federation may withdraw one. Only public fields live here.
ALTER TABLE shared_venue
  ADD COLUMN category text NOT NULL DEFAULT 'training' CHECK (category IN ('training', 'other')),
  ADD COLUMN status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'withdrawn')),
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN withdrawn_by text REFERENCES "user"(id),
  ADD COLUMN withdraw_reason text NOT NULL DEFAULT '' CHECK (length(withdraw_reason) <= 1000);
