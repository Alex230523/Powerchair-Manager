-- Security (07/11/2026), missing logging and alerting.
-- 1. The security journal: who tried what, from where (an account, or the
--    hash of a network address, never the address), kept twelve months.
CREATE TABLE IF NOT EXISTS security_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind ~ '^[a-z]+\.[a-z_]+$'),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  -- No foreign keys: a journal outlives what it speaks of, and is never rewritten by a cascade.
  organization_id uuid,
  actor_id text,
  source text NOT NULL DEFAULT '' CHECK (length(source) <= 100),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_event_created ON security_event (created_at);
CREATE INDEX IF NOT EXISTS security_event_kind ON security_event (kind, created_at);
-- 2. The alerts sent: one per rule and hour at most.
CREATE TABLE IF NOT EXISTS security_alert (
  rule text NOT NULL CHECK (rule ~ '^[a-z_]{3,40}$'),
  hour timestamptz NOT NULL,
  events integer NOT NULL,
  recipients integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule, hour)
);
-- 3. The journals are written once and never rewritten: no change, and no
--    deletion before the shortest retention (twelve months). One exception,
--    the closure of a club after its 30 days, which erases its data by law:
--    that transaction alone says so (SET LOCAL pfm.journal_purge = 'club').
CREATE OR REPLACE FUNCTION journal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'journal % is append only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF OLD.created_at > now() - interval '12 months' AND coalesce(current_setting('pfm.journal_purge', true), '') <> 'club' THEN
    RAISE EXCEPTION 'journal % keeps twelve months', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'platform_action', 'security_event'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_append_only' AND tgrelid = t::regclass) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION journal_append_only()', t || '_append_only', t);
    END IF;
  END LOOP;
END $$;
