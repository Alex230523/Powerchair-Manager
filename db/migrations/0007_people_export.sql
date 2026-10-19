ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export']::text[]);
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export']::text[]);
