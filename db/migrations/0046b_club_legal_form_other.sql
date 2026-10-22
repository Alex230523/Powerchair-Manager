-- Wave 16 (I3): the form « other » for a club. 0046 was already applied by a
-- preview with two forms only; a migration never changes once applied, so the
-- check is widened here (asbl, de_facto, other), nothing else.
ALTER TABLE organization DROP CONSTRAINT organization_legal_form_check;
ALTER TABLE organization ADD CONSTRAINT organization_legal_form_check CHECK (legal_form IS NULL OR legal_form IN ('asbl', 'de_facto', 'other'));
