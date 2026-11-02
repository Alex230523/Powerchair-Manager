-- 18: hall bookings and their invoices, worked out from the calendar.
-- Additive. A place says whether it must be booked: the club's home hall and
-- the « other » places (premises, restaurant) do not, by default.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendar_place' AND column_name = 'booking_needed') THEN
    ALTER TABLE calendar_place ADD COLUMN booking_needed boolean NOT NULL DEFAULT true;
    UPDATE calendar_place SET booking_needed = false WHERE home OR category <> 'training';
  END IF;
END $$;

-- One booking per hall and per season: the needs of the same hall are grouped.
CREATE TABLE IF NOT EXISTS venue_booking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  place_id uuid NOT NULL,
  season_id uuid,
  status text NOT NULL DEFAULT 'to_request' CHECK (status IN ('to_request', 'requested', 'confirmed', 'refused', 'cancelled')),
  reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 120),
  billing text NOT NULL DEFAULT 'monthly' CHECK (billing IN ('per_session', 'monthly', 'quarterly', 'yearly')),
  rate_label text CHECK (rate_label IS NULL OR length(rate_label) <= 120),
  planned_cost_cents integer NOT NULL DEFAULT 0 CHECK (planned_cost_cents BETWEEN 0 AND 100000000),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  requested_at timestamptz,
  answered_at timestamptz,
  confirmation_filename text CHECK (confirmation_filename IS NULL OR length(confirmation_filename) BETWEEN 1 AND 200),
  confirmation_media_type text CHECK (confirmation_media_type IS NULL OR confirmation_media_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  confirmation_content bytea CHECK (confirmation_content IS NULL OR octet_length(confirmation_content) BETWEEN 1 AND 5242880),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (place_id, organization_id) REFERENCES calendar_place(id, organization_id),
  FOREIGN KEY (season_id, organization_id) REFERENCES season(id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_booking_one ON venue_booking(organization_id, place_id, COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- The sessions a booking covers, as they were when last seen (to tell the hall what changed).
CREATE TABLE IF NOT EXISTS venue_booking_event (
  booking_id uuid NOT NULL REFERENCES venue_booking(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES calendar_event(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  PRIMARY KEY (booking_id, event_id)
);
CREATE INDEX IF NOT EXISTS venue_booking_event_event ON venue_booking_event(event_id);

-- The invoices of a booking (the file kept with it), each paid by at most one ledger line.
CREATE TABLE IF NOT EXISTS venue_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  booking_id uuid NOT NULL,
  period text NOT NULL DEFAULT '' CHECK (length(period) <= 20),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 100000000),
  issued_on date NOT NULL,
  filename text CHECK (filename IS NULL OR length(filename) BETWEEN 1 AND 200),
  media_type text CHECK (media_type IS NULL OR media_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  content bytea CHECK (content IS NULL OR octet_length(content) BETWEEN 1 AND 5242880),
  transaction_id uuid UNIQUE REFERENCES finance_transaction(id),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, organization_id) REFERENCES venue_booking(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS venue_invoice_booking ON venue_invoice(booking_id);
