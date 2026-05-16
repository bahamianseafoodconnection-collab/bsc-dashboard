-- Email marketing infrastructure (Phase 1).
--
-- Adds opt-in consent tracking to customers so the Founder AI's future
-- email-blast tool can target only customers who explicitly agreed to
-- marketing. `email` already exists on the customers table; we add:
--   • email_marketing_consent BOOLEAN  (true when customer ticks the box)
--   • email_consent_at        TIMESTAMPTZ  (when they opted in — audit trail)
--   • email_consent_source    TEXT  ('nassau_pos', 'newsletter', 'signup', ...)
--
-- All three default to NULL/FALSE so existing customers are NOT opted in.
-- A customer becomes opt-in only by an explicit checkbox tick.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email                    TEXT,
  ADD COLUMN IF NOT EXISTS email_marketing_consent  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_consent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_consent_source     TEXT;

CREATE INDEX IF NOT EXISTS customers_email_consent_idx
  ON customers (email_marketing_consent)
  WHERE email_marketing_consent = TRUE;

-- Verification
SELECT
  column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN ('email','email_marketing_consent','email_consent_at','email_consent_source')
ORDER BY column_name;

SELECT
  COUNT(*) AS total_customers,
  COUNT(email) AS with_email,
  COUNT(*) FILTER (WHERE email_marketing_consent = TRUE) AS opted_in
FROM customers;
