-- 12/11/2026: the year a club was founded, shown on the federation's page
-- of every club (with its president, its home hall and its titles).
ALTER TABLE organization ADD COLUMN IF NOT EXISTS founded_year integer CHECK (founded_year IS NULL OR founded_year BETWEEN 1850 AND 2100);
