-- 32 and 33: the federation's competences (delegated roles), and its
-- official circulars with their read receipts. Additive.

-- 1. The competences join the grants a mandate (or an invitation) may hold.
DO $$
DECLARE
  allowed text[] := ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive','dues.read','tax.identity',
    'federation.referees','federation.competitions','federation.discipline','federation.classification','federation.licences','federation.courses','federation.communication','federation.finance'];
BEGIN
  ALTER TABLE role_assignment DROP CONSTRAINT IF EXISTS role_assignment_grants_check;
  EXECUTE format('ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK (grants <@ %L::text[])', allowed);
  ALTER TABLE invitation DROP CONSTRAINT IF EXISTS invitation_grants_check;
  EXECUTE format('ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK (grants <@ %L::text[])', allowed);
  ALTER TABLE staff_role DROP CONSTRAINT IF EXISTS staff_role_grants_check;
  EXECUTE format('ALTER TABLE staff_role ADD CONSTRAINT staff_role_grants_check CHECK (grants <@ %L::text[])', array_remove(allowed, 'tax.identity'));
END $$;

-- The federation's staff before the competences keeps what it did: every competence, as its own adjustment.
UPDATE role_assignment
   SET grants = ARRAY(SELECT DISTINCT unnest(grants || ARRAY['federation.referees','federation.competitions','federation.discipline','federation.classification','federation.licences','federation.courses','federation.communication','federation.finance'])),
       grants_added = ARRAY(SELECT DISTINCT unnest(grants_added || ARRAY['federation.referees','federation.competitions','federation.discipline','federation.classification','federation.licences','federation.courses','federation.communication','federation.finance']))
 WHERE role = 'federation_worker' AND NOT grants && ARRAY['federation.referees','federation.competitions','federation.discipline','federation.classification','federation.licences','federation.courses','federation.communication','federation.finance']
   AND NOT EXISTS (SELECT 1 FROM mandate_staff_role m WHERE m.mandate_id = role_assignment.id);

-- 33. Circulars: written by the federation (communication), sent to chosen audiences, read and acknowledged.
CREATE TABLE IF NOT EXISTS circular (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  federation_id uuid NOT NULL REFERENCES organization(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  audiences text[] NOT NULL CHECK (cardinality(audiences) > 0 AND audiences <@ ARRAY['presidents','coaches','referees','members']::text[]),
  -- Empty: every affiliated club.
  clubs uuid[] NOT NULL DEFAULT '{}',
  ack_required boolean NOT NULL DEFAULT false,
  send_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent')),
  sent_at timestamptz,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, federation_id)
);
CREATE INDEX IF NOT EXISTS circular_due ON circular(send_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS circular_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circular_id uuid NOT NULL REFERENCES circular(id) ON DELETE CASCADE,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circular_recipient (
  circular_id uuid NOT NULL REFERENCES circular(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id),
  -- The club (or the federation, for a referee) the person received it through.
  organization_id uuid NOT NULL REFERENCES organization(id),
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  reminded_at timestamptz,
  PRIMARY KEY (circular_id, user_id)
);
CREATE INDEX IF NOT EXISTS circular_recipient_user ON circular_recipient(user_id, circular_id);
