-- 20260604010000_customers_address_column.sql
--
-- /dashboard/customers list query was failing with
--   "column customers.address does not exist"
-- because the API and UI were updated to read/write address before the
-- column actually existed in prod. This migration captures the column
-- addition (idempotent) so future env rebuilds aren't broken.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address TEXT;
