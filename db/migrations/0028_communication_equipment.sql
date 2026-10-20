-- Wave 9: club communication (sender, saved recipient groups, newsletters by
-- blocks, unsubscribe, mails prepared before an event), protected discussion
-- threads, equipment storage, expiry and purchase wishes.

-- Mails leave from the platform address (deliverability); the club chooses
-- the display name and the address that receives the replies.
ALTER TABLE organization
  ADD COLUMN mail_sender_name text NOT NULL DEFAULT ''
    CHECK (length(mail_sender_name) <= 80 AND mail_sender_name !~ '[\r\n<>"]'),
  ADD COLUMN mail_reply_to text
    CHECK (mail_reply_to IS NULL OR (length(mail_reply_to) <= 254 AND mail_reply_to ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$'));

-- A saved list of recipients, resolved again at each sending.
CREATE TABLE recipient_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  audiences text[] NOT NULL DEFAULT '{}'
    CHECK (audiences <@ ARRAY['players','guardians','coaches','volunteers','staff','alumni']::text[]),
  team_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(team_ids) <= 50),
  profile_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(profile_ids) <= 500),
  created_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id, name),
  UNIQUE (id, organization_id)
);

-- Newsletter written by blocks (title, text, button, upcoming events).
CREATE TABLE newsletter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 2 AND 160),
  blocks jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(blocks) = 'array' AND jsonb_array_length(blocks) <= 40),
  group_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(group_ids) <= 20),
  include_alumni boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  sent_at timestamptz,
  sent_by text REFERENCES "user"(id),
  recipients integer NOT NULL DEFAULT 0,
  UNIQUE (id, organization_id),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);
-- One row per address reached: its id is the private unsubscribe link.
CREATE TABLE newsletter_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  email_hash text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  user_id text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (newsletter_id, organization_id) REFERENCES newsletter(id, organization_id),
  UNIQUE (newsletter_id, email_hash)
);
-- Addresses that asked to stop receiving club news (hash of the lowercased email).
CREATE TABLE mail_unsubscribe (
  organization_id uuid NOT NULL REFERENCES organization(id),
  email_hash text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  source text NOT NULL CHECK (source IN ('link','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, email_hash)
);

-- A mail written ahead of an event and sent at a chosen time. If the event
-- moves (new version) or is cancelled, it waits for a new reading.
CREATE TABLE event_mail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  event_id uuid NOT NULL,
  group_id uuid,
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 2 AND 160),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  send_at timestamptz NOT NULL,
  event_version integer NOT NULL,
  event_start text NOT NULL,
  event_place text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','cancelled')),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  sent_at timestamptz,
  recipients integer NOT NULL DEFAULT 0,
  FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id),
  FOREIGN KEY (group_id, organization_id) REFERENCES recipient_group(id, organization_id)
);
CREATE INDEX event_mail_due ON event_mail(send_at) WHERE status = 'scheduled';
CREATE INDEX event_mail_event ON event_mail(event_id);

ALTER TABLE mail_job DROP CONSTRAINT mail_job_resource_type_check;
ALTER TABLE mail_job ADD CONSTRAINT mail_job_resource_type_check CHECK (resource_type IN ('auth','invitation','membership','team','family','registration','document','calendar','attendance','dues','training','match','license','newsletter','event_mail'));

-- Discussion threads per team (players and staff) and per team for parents.
ALTER TABLE message_thread
  ADD COLUMN kind text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct','team','parents')),
  ADD COLUMN team_id uuid,
  ADD COLUMN created_by text REFERENCES "user"(id),
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_by text REFERENCES "user"(id),
  ADD CONSTRAINT message_thread_team_kind CHECK ((kind = 'direct') = (team_id IS NULL)),
  ADD CONSTRAINT message_thread_team_fk FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id);
CREATE UNIQUE INDEX message_thread_one_per_team ON message_thread(team_id, kind) WHERE team_id IS NOT NULL;
-- "guardian": added so that a minor is never alone in a private conversation.
ALTER TABLE message_participant
  ADD COLUMN reason text NOT NULL DEFAULT 'member' CHECK (reason IN ('member','guardian'));
ALTER TABLE internal_message
  ADD COLUMN hidden_at timestamptz,
  ADD COLUMN hidden_by text REFERENCES "user"(id);
CREATE TABLE message_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  message_id uuid NOT NULL REFERENCES internal_message(id),
  reporter_id text NOT NULL REFERENCES "user"(id),
  reason text NOT NULL CHECK (reason IN ('inappropriate','harassment','personal_data','spam','other')),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text REFERENCES "user"(id),
  outcome text CHECK (outcome IS NULL OR outcome IN ('hidden','kept')),
  UNIQUE (message_id, reporter_id),
  CHECK ((resolved_at IS NULL) = (outcome IS NULL))
);
CREATE INDEX message_report_open ON message_report(organization_id) WHERE resolved_at IS NULL;

-- Equipment: where things are stored, small material with an expiry date,
-- and purchase wishes validated by the president or the treasurer.
ALTER TABLE equipment_chair ADD COLUMN storage text NOT NULL DEFAULT '' CHECK (length(storage) <= 120);
CREATE TABLE equipment_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  category text NOT NULL CHECK (category IN ('ball','first_aid','battery','charger','spare_part','jersey','protection','tool','other')),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 0 AND 10000),
  storage text NOT NULL DEFAULT '' CHECK (length(storage) <= 120),
  expires_on date,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX equipment_item_org ON equipment_item(organization_id, archived, expires_on);
CREATE TABLE equipment_wish (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  estimated_cents integer CHECK (estimated_cents IS NULL OR estimated_cents BETWEEN 0 AND 100000000),
  link text NOT NULL DEFAULT '' CHECK (length(link) <= 500 AND (link = '' OR link ~ '^https?://')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','refused','bought','cancelled')),
  requested_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by text REFERENCES "user"(id),
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '' CHECK (length(decision_note) <= 1000),
  bought_on date,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX equipment_wish_org ON equipment_wish(organization_id, status, created_at DESC);

-- Copying a week of the calendar is idempotent per request.
ALTER TABLE calendar_series ADD COLUMN copy_request uuid;
ALTER TABLE calendar_event ADD COLUMN copied_from uuid REFERENCES calendar_event(id);
CREATE INDEX calendar_series_copy_request ON calendar_series(copy_request) WHERE copy_request IS NOT NULL;
