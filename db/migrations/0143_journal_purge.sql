-- 07/11/2026: the closure of a club, 30 days after its request, erases its
-- data by law, journals included. That transaction alone says so
-- (SET LOCAL pfm.journal_purge = 'club'); any other deletion before twelve
-- months stays refused. A new migration: 0142 is never rewritten, the
-- databases that already applied it keep its checksum.
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
