-- 21 October 2026, at the owner's request: a club president has every right
-- from the start, including the two explicit habilitations (impairment and
-- health information, sensitive documents) that used to be granted one by
-- one. They stay ordinary grants: the president can still remove them from
-- a mandate in Members and access.
CREATE FUNCTION role_assignment_president_rights() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'club_president' THEN
    NEW.grants := ARRAY(SELECT DISTINCT g FROM unnest(NEW.grants || ARRAY['people.sensitive','documents.sensitive']::text[]) AS g ORDER BY g);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER role_assignment_president_rights BEFORE INSERT ON role_assignment
  FOR EACH ROW EXECUTE FUNCTION role_assignment_president_rights();
UPDATE role_assignment
  SET grants = ARRAY(SELECT DISTINCT g FROM unnest(grants || ARRAY['people.sensitive','documents.sensitive']::text[]) AS g ORDER BY g)
  WHERE role = 'club_president' AND revoked_at IS NULL;
