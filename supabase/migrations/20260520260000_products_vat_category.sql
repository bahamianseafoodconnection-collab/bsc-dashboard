-- VAT category on products.
--
-- Bahamas tax law:
--   • 0% VAT on uncooked food (raw seafood, frozen seafood, raw produce, dry grocery)
--   • 10% VAT on cooked / prepared items (juice bar smoothies, kitchen-prepped meals)
--   • 0% VAT on services (information / labour / consulting)
--
-- The 5-channel markups (22/19/35/40/40) remain. Only the VAT modifier
-- changes per product. lib/pricing.ts vatPctForCategory() owns the
-- 0/10 mapping; this column is the per-product input.
--
-- Default 'uncooked_food' because >95% of the catalog is raw seafood +
-- produce + grocery. Juice-bar / kitchen items must be flipped to
-- 'cooked_prepared' explicitly (via the admin UI or one-shot SQL).
--
-- This migration is purely additive — existing product_pricing rows
-- are NOT recomputed. Founder runs a price refresh when ready.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vat_category TEXT
    DEFAULT 'uncooked_food'
    CHECK (vat_category IN ('uncooked_food', 'cooked_prepared', 'service'));

UPDATE products SET vat_category = 'uncooked_food' WHERE vat_category IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_vat_category
  ON products (vat_category)
  WHERE vat_category <> 'uncooked_food';

COMMENT ON COLUMN products.vat_category IS
  'Bahamas VAT class. uncooked_food = 0%, cooked_prepared = 10% (juice/kitchen), service = 0%. Default uncooked_food because that covers the seafood+produce+grocery catalog. Juice-bar / kitchen items must be flipped explicitly.';
