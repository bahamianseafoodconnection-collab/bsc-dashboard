-- =====================================================================
-- BSC Migration: 20260528190000_add_categories_and_vat_toggle.sql
--
-- Founder direction 2026-05-28: add Household + Toiletries categories, and
-- a "VAT item / VAT-Free item" choice on the Add/Edit product screens.
--
-- category is the product_category ENUM → values must exist before the UI
-- can use them (enum-first rule). vat_category is TEXT + a CHECK → expand
-- it to support a plain VAT toggle:
--   standard_rated = 10% VAT (VAT item — e.g. household, toiletries, prepared)
--   zero_rated     = 0%  VAT (VAT-Free item)
-- The food-specific values (uncooked_food/cooked_prepared/service) stay for
-- existing rows + the photo-intake / Founder-AI flows.
--
-- No outer BEGIN/COMMIT: ALTER TYPE ADD VALUE runs as its own autocommit
-- statement (Supabase editor), avoiding the "new enum value used in same
-- transaction" restriction.
-- =====================================================================

-- 1. New product categories (idempotent).
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'household';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'toiletries';

-- 2. Expand the vat_category CHECK to add the VAT toggle values.
DO $$
DECLARE c text;
BEGIN
  -- Drop whatever the existing vat_category CHECK is named.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.products'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%vat_category%'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', c);
  END LOOP;

  ALTER TABLE public.products
    ADD CONSTRAINT products_vat_category_check
    CHECK (vat_category IN ('uncooked_food','cooked_prepared','service','standard_rated','zero_rated'));

  RAISE NOTICE '✅ Added categories household + toiletries; vat_category now allows standard_rated (10%%) + zero_rated (0%%).';
END $$;
