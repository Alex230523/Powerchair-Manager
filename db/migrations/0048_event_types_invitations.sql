-- Wave 16 (E1): event types defined by the club, invitations by group, trips
-- linked to an event.
--
-- event_type: the club's own names. family (training, match, meeting, other)
-- keeps presence thresholds, registers and statistics working whatever the
-- name; legacy_kind fills calendar_event.kind so nothing reading it breaks;
-- color is one of the type palette keys (wave 15); the defaults pre-fill the
-- form (ask for an answer, groups invited, attendance register).
CREATE TABLE event_type (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
 family text NOT NULL CHECK (family IN ('training', 'match', 'meeting', 'other')),
 legacy_kind text NOT NULL CHECK (legacy_kind IN ('training', 'friendly', 'meeting', 'tournament', 'camp', 'association', 'custom')),
 color text NOT NULL CHECK (color IN ('training', 'friendly', 'meeting', 'tournament', 'camp', 'association', 'custom')),
 icon text NOT NULL DEFAULT 'calendar' CHECK (length(icon) BETWEEN 1 AND 30),
 ask_response boolean NOT NULL DEFAULT false,
 default_groups text[] NOT NULL DEFAULT '{}' CHECK (default_groups <@ ARRAY['team', 'teamCoaches', 'players', 'guardians', 'coaches', 'staff']::text[]),
 register boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 0,
 archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX event_type_name ON event_type(organization_id, lower(trim(name))) WHERE NOT archived;

-- The proposed types (editable, renamable, archivable).
CREATE FUNCTION pfm_default_event_types(org uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO event_type(organization_id,name,family,legacy_kind,color,icon,ask_response,default_groups,register,position)
  SELECT org,v.name,v.family,v.kind,v.kind,v.icon,v.ask,v.groups,v.reg,v.pos FROM (VALUES
    ('Entraînement','training','training','attendance',true,ARRAY['team']::text[],true,1),
    ('Match amical','match','friendly','trophy',true,ARRAY['team','teamCoaches']::text[],true,2),
    ('Match de championnat','match','friendly','trophy',true,ARRAY['team','teamCoaches']::text[],true,3),
    ('Tournoi','match','tournament','trophy',true,ARRAY['team','teamCoaches']::text[],true,4),
    ('Teambuilding','other','custom','players',true,ARRAY['team']::text[],false,5),
    ('Réunion administrative','meeting','meeting','document',false,ARRAY['staff']::text[],false,6),
    ('Assemblée générale','meeting','association','landmark',false,ARRAY[]::text[],false,7),
    ('Stage','training','camp','calendar',true,ARRAY['team']::text[],true,8),
    ('Autre','other','custom','calendar',false,ARRAY[]::text[],false,9)
  ) AS v(name,family,kind,icon,ask,groups,reg,pos)
  WHERE NOT EXISTS(SELECT 1 FROM event_type e WHERE e.organization_id=org);
$$;
SELECT pfm_default_event_types(id) FROM organization WHERE kind='club';
CREATE FUNCTION pfm_club_event_types() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'club' THEN PERFORM pfm_default_event_types(NEW.id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organization_event_types AFTER INSERT ON organization FOR EACH ROW EXECUTE FUNCTION pfm_club_event_types();

-- Each event gets the type matching its kind; kind stays filled (the family's legacy value).
ALTER TABLE calendar_event ADD COLUMN event_type_id uuid;
ALTER TABLE calendar_event ADD CONSTRAINT calendar_event_type_fk FOREIGN KEY (event_type_id, organization_id) REFERENCES event_type(id, organization_id);
UPDATE calendar_event e SET event_type_id=(
  SELECT t.id FROM event_type t WHERE t.organization_id=e.organization_id AND t.legacy_kind=e.kind ORDER BY t.position LIMIT 1)
 WHERE e.event_type_id IS NULL;

-- Groups invited to an event (and people one by one: kind person), kept to
-- show and edit the choice; the people themselves become participants
-- (calendar_participant) and, when an answer is asked, the existing
-- invitations (attendance_invitation), never a second system.
CREATE TABLE calendar_invite_group (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 event_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('team', 'teamCoaches', 'players', 'guardians', 'coaches', 'staff', 'group', 'person')),
 ref uuid,
 FOREIGN KEY (event_id, organization_id) REFERENCES calendar_event(id, organization_id),
 CHECK ((kind IN ('team', 'group', 'person')) = (ref IS NOT NULL))
);
CREATE UNIQUE INDEX calendar_invite_group_unique ON calendar_invite_group(event_id, kind, COALESCE(ref, '00000000-0000-0000-0000-000000000000'::uuid));

-- A trip linked to its event (same club), shown on both sides.
ALTER TABLE trip ADD COLUMN calendar_event_id uuid;
ALTER TABLE trip ADD CONSTRAINT trip_calendar_event_fk FOREIGN KEY (calendar_event_id, organization_id) REFERENCES calendar_event(id, organization_id);
CREATE INDEX trip_calendar_event ON trip(calendar_event_id) WHERE calendar_event_id IS NOT NULL;

-- Undo after cancelling an event (wave 15, C10): the list of kinds grows by one.
ALTER TABLE undo_action DROP CONSTRAINT undo_action_kind_check;
ALTER TABLE undo_action ADD CONSTRAINT undo_action_kind_check CHECK (kind IN ('teamArchive','seasonArchive','endAssignment','move','chairRetire','messageHide','payment','eventCancel'));
