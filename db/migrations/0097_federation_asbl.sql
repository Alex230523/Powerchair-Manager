-- 35: the federation as an ASBL. Its books are its own (rows of its
-- organisation): what the clubs pay it (affiliations, fines) becomes its
-- income and what it pays its referees its expense, written once each, with
-- nothing of the club's private data. Its members are its clubs: each
-- affiliated club has one member profile in the federation, carried by the
-- person who represents it at the assembly. Additive.

ALTER TABLE finance_transaction
  ADD COLUMN IF NOT EXISTS auto_source text CHECK (auto_source IS NULL OR auto_source IN ('affiliation', 'fine', 'refereeExpense')),
  ADD COLUMN IF NOT EXISTS auto_ref uuid;
CREATE UNIQUE INDEX IF NOT EXISTS finance_transaction_auto ON finance_transaction(organization_id, auto_source, auto_ref)
  WHERE auto_source IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL;

ALTER TABLE club_person ADD COLUMN IF NOT EXISTS member_club_id uuid REFERENCES organization(id);
CREATE UNIQUE INDEX IF NOT EXISTS club_person_member_club ON club_person(organization_id, member_club_id) WHERE member_club_id IS NOT NULL;
