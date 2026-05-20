-- Adds parent-child + portion-size columns to `products` so the
-- explode_product Founder AI tool can derive retail SKUs from a
-- wholesale/case parent.
--
-- Schema:
--   parent_product_id    UUID — points to the wholesale/case parent.
--                        NULL if this row IS a parent or a standalone item.
--   portion_size         NUMERIC(10,3) — size of one retail unit (e.g. 2.000)
--   portion_unit         TEXT — 'lb' / 'oz' / 'each' / 'bag' / 'portion' / 'pack'
--   portions_per_parent  INT — how many of these come out of one parent
--                        (used for cost division: child_cost = parent_cost / N)
--
-- A child product's cost_per_unit is set at INSERT time to parent_cost / N.
-- Sell prices flow through the standard product_pricing rows, computed by
-- lib/pricing.ts calculatePrice() with the child's lower cost basis.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portion_size         NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS portion_unit         TEXT,
  ADD COLUMN IF NOT EXISTS portions_per_parent  INT;

CREATE INDEX IF NOT EXISTS idx_products_parent
  ON products (parent_product_id)
  WHERE parent_product_id IS NOT NULL;

COMMENT ON COLUMN products.parent_product_id IS
  'If this product is a retail portion derived from a wholesale/case parent, points to the parent. NULL otherwise.';
COMMENT ON COLUMN products.portion_size IS
  'Size of one retail unit, e.g. 2.000 for a 2lb bag or 6.000 for a 6oz portion.';
COMMENT ON COLUMN products.portion_unit IS
  'Unit of portion_size: lb / oz / each / bag / portion / pack.';
COMMENT ON COLUMN products.portions_per_parent IS
  'How many of these come out of one parent. child_cost = parent_cost / portions_per_parent.';
