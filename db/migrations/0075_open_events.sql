-- B9: open events. A calendar event opened to the public: registration by a
-- link without an account, places, a registration window, a waiting list
-- with a confirmation delay, an optional fee paid by transfer (B1), check-in
-- by QR code, reminders and an opinion survey.

-- 1. The opening of one calendar event (each occurrence of a series has its own).
CREATE TABLE IF NOT EXISTS open_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE,
  token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 32 AND 64),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 10000),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  fee_cents integer NOT NULL DEFAULT 0 CHECK (fee_cents BETWEEN 0 AND 100000000),
  -- The event's own questions: [{id, label, kind: text|yesno|choice, required, options}].
  questions jsonb NOT NULL DEFAULT '[]',
  confirm_hours integer NOT NULL DEFAULT 48 CHECK (confirm_hours BETWEEN 1 AND 168),
  reminders boolean NOT NULL DEFAULT true,
  survey boolean NOT NULL DEFAULT true,
  survey_questions jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  cancel_reason text NOT NULL DEFAULT '' CHECK (length(cancel_reason) <= 500),
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  CHECK (closes_at > opens_at),
  FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id)
);

-- 2. A registration: the person, their needs and answers, two separate consents, the place, the payment, the presence.
CREATE TABLE IF NOT EXISTS open_registration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  open_event_id uuid NOT NULL,
  -- The personal link: found by its hash, and kept sealed for the mails that carry it.
  token_hash text NOT NULL UNIQUE,
  token_sealed text NOT NULL,
  checkin_code text NOT NULL UNIQUE CHECK (length(checkin_code) BETWEEN 20 AND 64),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 200),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  needs jsonb NOT NULL DEFAULT '{}',
  answers jsonb NOT NULL DEFAULT '{}',
  consent_data boolean NOT NULL CHECK (consent_data),
  consent_image boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('confirmed', 'waiting', 'offered', 'cancelled')),
  offered_until timestamptz,
  payment_reference text,
  paid_cents integer NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  paid_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by text REFERENCES "user"(id),
  reminded_7 boolean NOT NULL DEFAULT false,
  reminded_1 boolean NOT NULL DEFAULT false,
  survey_sent boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'nl', 'en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE (id, organization_id),
  FOREIGN KEY (open_event_id, organization_id) REFERENCES open_event(id, organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS open_registration_email ON open_registration(open_event_id, lower(email)) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS open_registration_reference ON open_registration(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS open_registration_queue ON open_registration(open_event_id, created_at) WHERE status = 'waiting';

-- 3. The opinions after the event, one per registration.
CREATE TABLE IF NOT EXISTS open_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  open_event_id uuid NOT NULL,
  registration_id uuid NOT NULL UNIQUE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  answers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (registration_id, organization_id) REFERENCES open_registration(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (open_event_id, organization_id) REFERENCES open_event(id, organization_id) ON DELETE CASCADE
);

-- 4. Mails to the registered people, and the bank lines that pay a registration.
ALTER TABLE mail_job DROP CONSTRAINT IF EXISTS mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK (resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license','newsletter','event_mail','funding','digest','automation','tax','open_event'));
ALTER TABLE bank_allocation DROP CONSTRAINT IF EXISTS bank_allocation_target_check;
ALTER TABLE bank_allocation ADD CONSTRAINT bank_allocation_target_check CHECK (target IN ('receivable', 'credit', 'pot', 'partner', 'grant', 'event', 'other'));
