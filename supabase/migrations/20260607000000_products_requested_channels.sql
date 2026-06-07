-- 20260607000000_products_requested_channels.sql
--
-- Adds a single TEXT column to products to capture supplier channel
-- intent at self-listing time. /api/supplier-portal/add-product will
-- write the supplier's ticked channels here (e.g. "online,wholesale")
-- on insert. Founder reads it from the pending-approval queue at
-- /founder-ai/products/pending to know which channels the supplier
-- asked for, then flips the actual sell_* flags during approval.
--
-- Nullable + idempotent. No default. No data migration of existing rows.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requested_channels TEXT;
