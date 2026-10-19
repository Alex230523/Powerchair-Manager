ALTER TABLE invitation ADD COLUMN valid_from timestamptz NOT NULL DEFAULT now();
ALTER TABLE invitation ADD CONSTRAINT invitation_date_order CHECK(valid_until IS NULL OR valid_until>valid_from);
