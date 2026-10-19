-- Directory categories are sporting labels, never login permissions.
ALTER TABLE club_person ADD COLUMN directory_roles text[] NOT NULL DEFAULT '{}',
 ADD COLUMN former_roles text[] NOT NULL DEFAULT '{}',
 ADD COLUMN playing_position text NOT NULL DEFAULT '' CHECK(length(playing_position)<=80),
 ADD COLUMN jersey_number integer CHECK(jersey_number BETWEEN 0 AND 99),
 ADD CONSTRAINT directory_roles_allowed CHECK(directory_roles <@ ARRAY['player','coach']::text[]),
 ADD CONSTRAINT former_roles_allowed CHECK(former_roles <@ directory_roles);
UPDATE club_person c SET directory_roles=q.roles FROM (
 SELECT profile_id,array_agg(DISTINCT role) AS roles FROM team_membership WHERE role IN ('player','coach') GROUP BY profile_id
) q WHERE c.id=q.profile_id;
