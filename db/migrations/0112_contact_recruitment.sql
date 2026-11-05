-- 04/11/2026: the recruitment module is removed; a contact can be tagged
-- « Recrutement » instead (a rehabilitation centre, a school, an association
-- that sends new players). Additive: the constraint only grows.
ALTER TABLE contact DROP CONSTRAINT IF EXISTS contact_tags_check;
ALTER TABLE contact ADD CONSTRAINT contact_tags_check
  CHECK (tags <@ ARRAY['sponsor','donor','public','federation','venue','press','supplier','medical','volunteer','rental','recruitment','other']::text[]);
