-- =====================================================================
-- BSC Migration: 20260528180000_fix_product_pricing_current_constraint.sql
--
-- BUG: product_pricing has a plain UNIQUE(product_id, channel, is_current)
-- constraint (product_pricing_product_id_channel_is_current_key). That
-- permits only ONE historical (is_current=false) row per (product,
-- channel) — so the immutable retire-then-insert pricing pattern collides
-- on the 2nd price/margin change:
--   "duplicate key value violates unique constraint
--    product_pricing_product_id_channel_is_current_key"
-- It silently affects every retire+insert path: bsc_set_channel_price,
-- recalc_channel_prices_on_purchase, add-product, the lock-in trigger.
--
-- FIX: drop that constraint and enforce the ACTUAL invariant with a
-- partial unique index — at most ONE CURRENT price per (product, channel),
-- with unlimited price history. DB-authoritative, fixes all paths at once.
-- =====================================================================

BEGIN;

-- Safety: there must be at most one current row per (product, channel)
-- already (the old constraint guaranteed it). Defensively de-dupe any
-- accidental extras before creating the partial unique index.
WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY product_id, channel
           ORDER BY effective_from DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.product_pricing
  WHERE is_current = true
)
UPDATE public.product_pricing pp
SET is_current = false
FROM ranked
WHERE pp.id = ranked.id AND ranked.rn > 1;

-- Replace the over-broad unique constraint with the correct invariant.
ALTER TABLE public.product_pricing
  DROP CONSTRAINT IF EXISTS product_pricing_product_id_channel_is_current_key;

CREATE UNIQUE INDEX IF NOT EXISTS product_pricing_one_current_per_channel
  ON public.product_pricing (product_id, channel)
  WHERE is_current = true;

-- Verify
DO $pf$
DECLARE dupes int;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT product_id, channel FROM public.product_pricing
    WHERE is_current = true GROUP BY product_id, channel HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN RAISE EXCEPTION 'Still % product+channel combos with multiple current rows', dupes; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_pricing_product_id_channel_is_current_key') THEN
    RAISE EXCEPTION 'Old constraint still present';
  END IF;
  RAISE NOTICE '✅ product_pricing now allows full price history; one current row per (product, channel) enforced. Retire+insert pricing works repeatedly.';
END $pf$;

COMMIT;
