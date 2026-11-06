-- Console, series C (06/11/2026): the support desk and the GDPR requests followed end to end.
-- Additive and idempotent.

-- A ticket: one account writes to the platform's support, from the organisation it was in (if any).
-- open: waiting for the operators; answered: waiting for the person; closed.
CREATE TABLE IF NOT EXISTS support_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization(id),
  user_id text NOT NULL REFERENCES "user"(id),
  category text NOT NULL DEFAULT 'question' CHECK (category IN ('question', 'billing', 'bug', 'data', 'other')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 3 AND 160),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'answered', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  assigned_to text REFERENCES "user"(id),
  first_reply_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_state ON support_ticket(state, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_user ON support_ticket(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_org ON support_ticket(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_ticket(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES "user"(id),
  by_operator boolean NOT NULL DEFAULT false,
  text text NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_message_ticket ON support_message(ticket_id, created_at);

-- The operators' canned replies, in the three languages.
CREATE TABLE IF NOT EXISTS support_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  text_fr text NOT NULL CHECK (length(text_fr) BETWEEN 1 AND 4000),
  text_nl text NOT NULL DEFAULT '' CHECK (length(text_nl) <= 4000),
  text_en text NOT NULL DEFAULT '' CHECK (length(text_en) <= 4000),
  created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- The platform's reminders to a presidency about a GDPR request: a week before the deadline,
-- once overdue (each once), and by hand from the console (as often as needed).
CREATE TABLE IF NOT EXISTS data_request_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES data_request(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('week', 'overdue', 'manual')),
  operator_id text REFERENCES "user"(id),
  recipients integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS data_request_notice_once ON data_request_notice(request_id, step) WHERE step <> 'manual';

-- The certificate of a request handled (done or refused): RGPD-YYYY-NNNN, given to the person and the presidency.
ALTER TABLE data_request ADD COLUMN IF NOT EXISTS certificate_number text;
CREATE UNIQUE INDEX IF NOT EXISTS data_request_certificate ON data_request(certificate_number) WHERE certificate_number IS NOT NULL;
