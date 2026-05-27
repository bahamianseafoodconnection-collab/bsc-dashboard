-- =====================================================================
-- BSC Migration: 20260527160000_products_stock_count.sql
--
-- Adds stock tracking to the products table so the /admin/inventory
-- spreadsheet can mark items in / out of stock and show low-stock
-- warnings.
--
-- Why on products (denormalized snapshot) and NOT inventory_movements?
-- For Phase 3 of the spreadsheet build we need a single-cell editable
-- value the founder can type into ("we have 12 left"). Movement-level
-- accounting can layer in later via inventory_movements + a trigger
-- that recomputes the products.stock_count snapshot on every movement.
-- For now: editable snapshot, defaults to 0, no movements table needed.
--
-- Columns:
--   stock_count           — current units on hand (numeric, nullable
--                           since some products are made-to-order)
--   low_stock_threshold   — alert when stock_count drops below this
--   in_stock              — computed view (stock_count > 0) NOT a
--                           stored column; the spreadsheet derives it
--                           inline from stock_count
--
-- Bonus: adds is_featured + featured_until columns so the upcoming
-- "feature this product on /market" toggle has somewhere to land. No
-- UI surface yet — schema-only here, UI follows whenever the founder
-- asks.
-- =====================================================================

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_count           numeric(12,2),
  ADD COLUMN IF NOT EXISTS low_stock_threshold   numeric(12,2),
  ADD COLUMN IF NOT EXISTS is_featured           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until        timestamptz;

COMMENT ON COLUMN public.products.stock_count IS
  'Current units on hand. NULL = not tracked (made-to-order). 0 = out of stock. Editable inline in /admin/inventory spreadsheet.';
COMMENT ON COLUMN public.products.low_stock_threshold IS
  'Optional alert level. When stock_count drops to or below this, the row shows a "low stock" pill in the spreadsheet + Founder AI surfaces it.';

CREATE INDEX IF NOT EXISTS idx_products_low_stock
  ON public.products (stock_count)
  WHERE stock_count IS NOT NULL AND stock_count >= 0;

-- Verify
DO $pf$
DECLARE
  has_stock     boolean;
  has_threshold boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock_count'
  ) INTO has_stock;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'low_stock_threshold'
  ) INTO has_threshold;
  IF NOT has_stock OR NOT has_threshold THEN
    RAISE EXCEPTION 'Migration failed: stock_count=% threshold=%', has_stock, has_threshold;
  END IF;
  RAISE NOTICE '✅ stock_count + low_stock_threshold added to products';
END $pf$;

COMMIT;
