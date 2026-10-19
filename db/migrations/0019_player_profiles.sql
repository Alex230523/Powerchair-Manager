-- Player profile (module 02): sport data and support data kept apart.
-- Sport profile: visible to people who can see the player. Classification is the
-- official sporting class, not a medical record.
CREATE TABLE player_sport_profile (
 profile_id uuid PRIMARY KEY, organization_id uuid NOT NULL,
 classification text NOT NULL DEFAULT 'not_classified' CHECK(classification IN ('PF1','PF2','pending','not_classified')),
 classification_valid_until date,
 control text NOT NULL DEFAULT '' CHECK(control IN ('','right_hand','left_hand','chin','head','other')),
 sport_notes text NOT NULL DEFAULT '' CHECK(length(sport_notes)<=2000),
 version integer NOT NULL DEFAULT 1, updated_by text REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id)
);
-- Support profile: practical needs for staff and coaches (accompaniment, safety, emergency contact).
-- Impairment and medical notes are encrypted at rest (confidential_ciphertext) and readable only by
-- the person, an authorised legal representative, or staff holding the explicit people.sensitive grant.
CREATE TABLE player_support_profile (
 profile_id uuid PRIMARY KEY, organization_id uuid NOT NULL,
 support_needs text NOT NULL DEFAULT '' CHECK(length(support_needs)<=2000),
 safety_notes text NOT NULL DEFAULT '' CHECK(length(safety_notes)<=2000),
 emergency_contact text NOT NULL DEFAULT '' CHECK(length(emergency_contact)<=300),
 confidential_ciphertext text,
 version integer NOT NULL DEFAULT 1, updated_by text REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(profile_id,organization_id) REFERENCES club_person(id,organization_id)
);
ALTER TABLE role_assignment DROP CONSTRAINT role_assignment_grants_check;
ALTER TABLE invitation DROP CONSTRAINT invitation_grants_check;
ALTER TABLE role_assignment ADD CONSTRAINT role_assignment_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive']::text[]);
ALTER TABLE invitation ADD CONSTRAINT invitation_grants_check CHECK(grants <@ ARRAY['members.read','invitations.create','audit.read','people.read','people.manage','teams.manage','people.export','notifications.manage','registrations.manage','documents.read','documents.manage','documents.sensitive','calendar.manage','calendar.read','attendance.manage','dues.manage','equipment.manage','people.sensitive']::text[]);
