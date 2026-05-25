-- =====================================================================
-- BSC Migration: 20260525000000_orders_card_ref.sql
--
-- Add structured card_ref column to orders + backfill from existing
-- Nassau POS admin_notes "Card ref: XXX | Terminal: YYY" string format
-- + partial index for fast lookups.
--
-- Why: Nassau POS today stuffs the card reference into admin_notes
-- free-text (chain-walk recon gap #2). Items 5-6 of Track A switch
-- Nassau UI to require + write the structured column, and the receipt
-- route to render from it instead of regex-parsing admin_notes.
--
-- Applied to prod via Supabase SQL Editor on 2026-05-25. This file
-- records the change in repo for migration audit trail.
--
-- Verify on apply (Part 2 output):
--   column_exists      = 1     (column added)
--   backfilled_count   = 0     (no historical "Card ref:" admin_notes
--                                in prod yet — the 9 existing
--                                pos_sale_nassau test orders were
--                                cash sales)
--   unbackfilled_admin = 0     (regex caught everything it should)
-- =====================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS card_ref text;

-- Backfill from the existing "Card ref: XXX" admin_notes pattern used
-- by Nassau POS today. Idempotent — re-running is safe (WHERE card_ref
-- IS NULL filter). Conservative regex captures the ref after
-- "Card ref:" up to a " | " separator or end of admin_notes.
UPDATE public.orders
   SET card_ref = trim(substring(admin_notes from 'Card ref:\s*([^|]+)'))
 WHERE admin_notes LIKE '%Card ref:%'
   AND card_ref IS NULL;

-- Partial index — small footprint (only indexes non-null), supports
-- /api/pos/receipt + future RBC daily reconciliation lookups.
CREATE INDEX IF NOT EXISTS idx_orders_card_ref
  ON public.orders (card_ref)
  WHERE card_ref IS NOT NULL;

COMMIT;
