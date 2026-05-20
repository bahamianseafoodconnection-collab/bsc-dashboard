-- Adds time-bound specials to products. Marketplace shows products in
-- a "🔥 Specials" section at the top while NOW() is between
-- special_starts_at and special_ends_at; the special_price replaces
-- the channel price during that window. Outside the window, products
-- render at their regular product_pricing.manual_unit_price.
--
-- Columns:
--   special_price     NUMERIC(10,2)  override price (BSD) during the window
--   special_starts_at TIMESTAMPTZ    when the special goes live
--   special_ends_at   TIMESTAMPTZ    when the special closes (the "closed date")
--   special_label     TEXT           short pitch shown on the card, e.g.
--                                    "Tuesday Shrimp Special" or "Saturday Only"
--
-- A product is "currently on special" when:
--   special_price IS NOT NULL
--   AND (special_starts_at IS NULL OR special_starts_at <= NOW())
--   AND (special_ends_at   IS NULL OR special_ends_at   >= NOW())
--   AND sell_online = true
-- (the existing channel flag still gates whether it's even sellable).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS special_price     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS special_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS special_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS special_label     TEXT;

CREATE INDEX IF NOT EXISTS idx_products_special_ends_at
  ON products (special_ends_at)
  WHERE special_price IS NOT NULL;

COMMENT ON COLUMN products.special_price IS
  'If set, overrides the regular channel price while NOW() is between special_starts_at and special_ends_at.';
COMMENT ON COLUMN products.special_starts_at IS
  'When the special goes live. NULL = live immediately when special_price is set.';
COMMENT ON COLUMN products.special_ends_at IS
  'When the special closes. NULL = open-ended (until special_price is cleared). The "closed date" the founder thinks of when scheduling.';
COMMENT ON COLUMN products.special_label IS
  'Short label shown on the product card, e.g. "Tuesday Shrimp Special".';
