-- Wave 16 (I2): invitations sent when someone is added, created from the
-- person's file in the club, then a guided account creation.
-- profile_id: the file (club_person) the new account takes over.
-- team_id: the team named in the email.
-- guardian_of: for a parent invited for a minor player, the child's file.
-- greeting: the first name the email and the welcome page use.
-- disputed_at, disputed_note: « Ce n'est pas mon rôle », the invitation waits.
-- resent_from: the invitation a « Renvoyer » replaced (the old link is revoked).
ALTER TABLE invitation
  ADD COLUMN profile_id uuid,
  ADD COLUMN team_id uuid,
  ADD COLUMN guardian_of uuid,
  ADD COLUMN greeting text NOT NULL DEFAULT '' CHECK (length(greeting) <= 120),
  ADD COLUMN disputed_at timestamptz,
  ADD COLUMN disputed_note text NOT NULL DEFAULT '' CHECK (length(disputed_note) <= 500),
  ADD COLUMN resent_from uuid REFERENCES invitation(id),
  ADD FOREIGN KEY (profile_id, organization_id) REFERENCES club_person(id, organization_id),
  ADD FOREIGN KEY (guardian_of, organization_id) REFERENCES club_person(id, organization_id),
  ADD FOREIGN KEY (team_id, organization_id) REFERENCES team(id, organization_id);
CREATE INDEX invitation_profile ON invitation(profile_id) WHERE profile_id IS NOT NULL;
