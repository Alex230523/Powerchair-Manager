-- 05/11/2026 (lot 2): a transfer's training compensation, once the federation
-- confirmed the payment, is written in both clubs' books. Additive and
-- idempotent (the check is widened, never narrowed).
ALTER TABLE finance_transaction DROP CONSTRAINT IF EXISTS finance_transaction_auto_source_check;
ALTER TABLE finance_transaction ADD CONSTRAINT finance_transaction_auto_source_check CHECK (auto_source IS NULL OR auto_source IN ('affiliation', 'fine', 'refereeExpense', 'transfer', 'international', 'internationalOut'));
