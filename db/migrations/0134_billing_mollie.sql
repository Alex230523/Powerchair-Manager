-- 06/11/2026 (console, series B): online payment of the platform's invoices
-- through a Mollie payment link, and how an invoice got paid.
ALTER TABLE billing_invoice ADD COLUMN IF NOT EXISTS mollie_link_id text;
ALTER TABLE billing_invoice ADD COLUMN IF NOT EXISTS pay_url text NOT NULL DEFAULT '' CHECK (length(pay_url) <= 300);
ALTER TABLE billing_invoice ADD COLUMN IF NOT EXISTS paid_via text NOT NULL DEFAULT '' CHECK (paid_via IN ('', 'manual', 'mollie'));
CREATE INDEX IF NOT EXISTS billing_invoice_mollie ON billing_invoice(mollie_link_id) WHERE mollie_link_id IS NOT NULL;
-- What Mollie told us, as received (verified by reading the link back from the API).
CREATE TABLE IF NOT EXISTS billing_webhook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('mollie')),
  external_id text NOT NULL,
  invoice_id uuid REFERENCES billing_invoice(id),
  status text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '' CHECK (length(outcome) <= 60),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_webhook_recent ON billing_webhook(received_at DESC);
