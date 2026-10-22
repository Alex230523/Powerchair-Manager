-- Wave 16 (I3): the federation creates its clubs and invites their presidents.
-- city, affiliation_number, legal_form: the club's public identity as the
-- federation records it (affiliation number unique within a federation); the
-- company number already exists (0027).
ALTER TABLE organization
  ADD COLUMN city text NOT NULL DEFAULT '' CHECK (length(city) <= 80),
  ADD COLUMN affiliation_number text NOT NULL DEFAULT '' CHECK (length(affiliation_number) <= 40),
  ADD COLUMN legal_form text CHECK (legal_form IS NULL OR legal_form IN ('asbl', 'de_facto'));
CREATE UNIQUE INDEX organization_affiliation_number ON organization(federation_id, lower(affiliation_number))
  WHERE federation_id IS NOT NULL AND affiliation_number <> '';
-- issued_by_federation: an invitation into a club sent by its federation
-- (first president, or a change of president). The issuer's rights are checked
-- in the federation, not in the club.
-- succession: on acceptance, the other club_president mandates of the club end
-- (never a club without a president: the old one stays until the new one accepts).
ALTER TABLE invitation
  ADD COLUMN issued_by_federation uuid REFERENCES organization(id),
  ADD COLUMN succession boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT invitation_succession_president CHECK (NOT succession OR role = 'club_president');
