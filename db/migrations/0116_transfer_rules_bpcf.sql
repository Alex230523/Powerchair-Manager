-- 04/11/2026 (règlement BPCF 2025, art. 1/12): a consented transfer is possible
-- all season long; outside a consented one, a player leaves during a transfer
-- period with the federation's validation; at most so many transfers from one
-- club to another per season.
ALTER TABLE transfer_rules ADD COLUMN IF NOT EXISTS consented_anytime boolean NOT NULL DEFAULT false;
ALTER TABLE transfer_rules ADD COLUMN IF NOT EXISTS max_per_pair_season integer CHECK (max_per_pair_season IS NULL OR max_per_pair_season BETWEEN 0 AND 100);
