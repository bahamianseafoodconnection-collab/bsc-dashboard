-- BSC × BWA — Full seed of approved BWA products (98 items)
-- Date: 2026-05-16
-- Source: bwa_bsc_pricelist.jsx (BSC founder, 5/4/2026)
--
-- Categories (11): Rice, Flour & Corn Meal, Cooking Oils, Pasta & Spaghetti,
-- Sauces, Salt, Canned Peas & Beans, Tuna & Canned Fish, Meat & Proteins,
-- Turkey, Evaporated Milk.
--
-- Channel: online_market only. Other channels remain off; founder can
-- toggle later via the Founder AI set_product_channels tool.
--
-- Sell price (online_market) formula:
--   X items (VAT-exempt): sell = cost / 0.75 * 1.10   (25% margin + 10% VAT)
--   T items (VAT 10%):    sell = cost / 0.75          (cost already VAT-inclusive)
--
-- Idempotent:
--   • Re-running this migration is safe.
--   • Existing rows are NOT duplicated (WHERE NOT EXISTS).
--   • Pricing rows are RECOMPUTED at the end from current cost + vat_code,
--     so any stale values from a partial earlier run are refreshed.

-- ──────────────────────────────────────────────────────────────────
-- 1. Schema extensions (run outside transaction so ALTER TYPE commits)
-- ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'product_category' AND e.enumlabel = 'grocery'
  ) THEN
    ALTER TYPE product_category ADD VALUE 'grocery';
  END IF;
END $$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vat_code  CHAR(1) DEFAULT 'X',
  ADD COLUMN IF NOT EXISTS vat_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pack_size TEXT;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_vat_code_check;
ALTER TABLE products ADD CONSTRAINT  products_vat_code_check CHECK (vat_code IN ('X','T'));

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 2. Ensure BWA supplier row exists
-- ──────────────────────────────────────────────────────────────────
INSERT INTO suppliers (name, code, is_active, created_at)
SELECT 'Bahamas Wholesale Agencies', 'BWA', TRUE, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers
  WHERE code = 'BWA' OR name ILIKE '%bahamas wholesale%'
);

-- ──────────────────────────────────────────────────────────────────
-- 3. Stage all 98 items in temp table
-- ──────────────────────────────────────────────────────────────────
CREATE TEMP TABLE bwa_seed (
  sku             TEXT,
  name            TEXT,
  category        TEXT,
  unit_of_measure TEXT,
  unit_type       TEXT,
  cost            NUMERIC(10,2),
  vat_code        CHAR(1),
  pack_size       TEXT
) ON COMMIT DROP;

INSERT INTO bwa_seed VALUES
  -- Rice (13)
  ('BWA-480-0050', 'Rice Par Excellence Par Boiled 50lb',          'grocery', 'each', 'each',  36.45, 'X', '50lb EA'),
  ('BWA-480-0065', 'Rice Par Excellence Par Boiled 4/10lb',        'grocery', 'each', 'each',  31.19, 'X', '4/10lb BALE'),
  ('BWA-480-0070', 'Rice Par Excellence Par Boiled 8/5lb',         'grocery', 'each', 'each',  34.48, 'X', '8/5lb BALE'),
  ('BWA-480-0080', 'Rice Par Excellence Par Boiled 20/3lb',        'grocery', 'each', 'each',  49.58, 'X', '20/3lb BALE'),
  ('BWA-480-0090', 'Rice Par Excellence Par Boiled 30/2lb',        'grocery', 'each', 'each',  54.94, 'X', '30/2lb BALE'),
  ('BWA-480-0095', 'Garden Harvest Rice Par Excellence',           'grocery', 'each', 'each',  52.55, 'X', '6/3.25lb CS'),
  ('BWA-480-0100', 'Yellow Rice Par Excellence',                   'grocery', 'each', 'each',  43.40, 'X', '6/3.5lb CS'),
  ('BWA-480-0105', 'Long Grain Par Excellence Rice 4/10lb',        'grocery', 'each', 'each',  28.24, 'X', '4/10lb BALE'),
  ('BWA-480-0110', 'Long Grain Par Excellence Rice 8/5lb',         'grocery', 'each', 'each',  31.53, 'X', '8/5lb BALE'),
  ('BWA-480-0120', 'Long Grain Par Excellence Rice 3/20lb',        'grocery', 'each', 'each',  40.88, 'X', '3/20lb BALE'),
  ('BWA-480-0130', 'Long Grain Par Excellence Rice 20/3lb',        'grocery', 'each', 'each',  45.60, 'X', '20/3lb BALE'),
  ('BWA-480-0140', 'Long Grain Par Excellence Rice 30/2lb',        'grocery', 'each', 'each',  46.54, 'X', '30/2lb BALE'),
  ('BWA-480-0170', 'Long Grain Par Excellence Rice 50lb',          'grocery', 'each', 'each',  29.54, 'X', '50lb EA'),
  -- Flour & Corn Meal (3)
  ('BWA-384-1095', 'Valrico Fine Corn Meal',                       'grocery', 'each', 'each',  20.65, 'X', '24/12oz CS'),
  ('BWA-384-1100', 'Valrico Coarse Corn Meal',                     'grocery', 'each', 'each',  20.65, 'X', '24/12oz CS'),
  ('BWA-410-0060', 'OK Flour',                                     'grocery', 'each', 'each',  40.00, 'X', '12/2kg BALE'),
  -- Cooking Oils (10)
  ('BWA-405-0010', 'Marina Oil Veg/Soy',                           'grocery', 'each', 'each',  53.75, 'X', '2/17.5lb CS'),
  ('BWA-405-0015', 'Marina Oil Veg/Soy',                           'grocery', 'each', 'each',  70.41, 'X', '6/1gal CS'),
  ('BWA-685-0009', 'Louana Vegetable Oil',                         'grocery', 'each', 'each',  29.04, 'X', '12/16oz CS'),
  ('BWA-685-0020', 'Louana Vegetable Oil',                         'grocery', 'each', 'each',  41.15, 'X', '12/24oz CS'),
  ('BWA-685-0021', 'Louana Peanut Oil',                            'grocery', 'each', 'each',  70.45, 'X', '12/24oz CS'),
  ('BWA-685-0040', 'Louana Canola Oil',                            'grocery', 'each', 'each',  63.80, 'X', '9/48oz CS'),
  ('BWA-685-0050', 'Louana Vegetable Oil',                         'grocery', 'each', 'each',  58.24, 'X', '9/48oz CS'),
  ('BWA-685-0093', 'Louana Coconut Oil',                           'grocery', 'each', 'each',  30.95, 'X', '6/14oz CS'),
  ('BWA-685-0095', 'Louana Coconut Oil',                           'grocery', 'each', 'each',  48.05, 'X', '6/30oz CS'),
  ('BWA-685-0110', 'Louana Avocado Oil',                           'grocery', 'each', 'each',  65.65, 'X', '6/16oz CS'),
  -- Pasta & Spaghetti (21)
  ('BWA-118-1003', 'Barilla Spaghetti Thin',                       'grocery', 'each', 'each',  45.50, 'X', '20/16oz CS'),
  ('BWA-118-1005', 'Barilla Spaghetti',                            'grocery', 'each', 'each',  45.50, 'X', '20/16oz CS'),
  ('BWA-118-1007', 'Barilla Thick Spaghettoni',                    'grocery', 'each', 'each',  45.50, 'X', '20/16oz CS'),
  ('BWA-118-3920', 'Barilla Red Lentil Spaghetti',                 'grocery', 'each', 'each',  62.50, 'X', '18/8.8oz CS'),
  ('BWA-118-3930', 'Barilla Chickpea Spaghetti',                   'grocery', 'each', 'each',  62.50, 'X', '18/8.8oz CS'),
  ('BWA-118-0198', 'Barilla Oven Ready Lasagne',                   'grocery', 'each', 'each',  39.80, 'X', '12/255g CS'),
  ('BWA-118-0295', 'Barilla Rigatoni',                             'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-1001', 'Barilla Angel Hair',                           'grocery', 'each', 'each',  45.50, 'X', '20/16oz CS'),
  ('BWA-118-1010', 'Barilla Linguine',                             'grocery', 'each', 'each',  45.50, 'X', '20/16oz CS'),
  ('BWA-118-1016', 'Barilla Rotini',                               'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-1018', 'Barilla Tri Colour Rotini',                    'grocery', 'each', 'each',  36.40, 'X', '16/12oz CS'),
  ('BWA-118-1020', 'Barilla Tri Colour Penne',                     'grocery', 'each', 'each',  36.40, 'X', '16/12oz CS'),
  ('BWA-118-1022', 'Barilla Ziti',                                 'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-3044', 'Barilla Elbow Macaroni',                       'grocery', 'each', 'each',  36.40, 'X', '16/16oz CS'),
  ('BWA-118-3066', 'Barilla Farfalle',                             'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-3071', 'Barilla Penne Rigate',                         'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-3081', 'Barilla Large Shells',                         'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-3086', 'Barilla Medium Shells',                        'grocery', 'each', 'each',  27.35, 'X', '12/16oz CS'),
  ('BWA-118-3900', 'Barilla Red Lentil Penne',                     'grocery', 'each', 'each',  34.75, 'X', '10/8.8oz CS'),
  ('BWA-118-3910', 'Barilla Red Lentil Rotini',                    'grocery', 'each', 'each',  34.75, 'X', '10/8.8oz CS'),
  ('BWA-118-7130', 'Barilla Fettuccine',                           'grocery', 'each', 'each',  45.50, 'X', '20/16oz CS'),
  -- Sauces & Tomato (6)
  ('BWA-118-1280', 'Barilla Sauce Pesto Genovese',                 'grocery', 'each', 'each',  35.70, 'X', '8/6.2oz CS'),
  ('BWA-118-1285', 'Barilla Sauce Traditional',                    'grocery', 'each', 'each',  33.50, 'X', '8/24oz CS'),
  ('BWA-118-1292', 'Barilla Sauce Marinara',                       'grocery', 'each', 'each',  33.50, 'X', '8/24oz CS'),
  ('BWA-118-1296', 'Barilla Sauce Tomato & Basil',                 'grocery', 'each', 'each',  33.50, 'X', '8/24oz CS'),
  ('BWA-118-1297', 'Barilla Sauce Roast Garlic',                   'grocery', 'each', 'each',  33.50, 'X', '8/24oz CS'),
  ('BWA-210-9445', 'Heinz Tomato Paste #10 Can',                   'grocery', 'each', 'each',  10.15, 'X', 'EA'),
  -- Salt (8) — 6 T-rated, 2 X-rated
  ('BWA-384-1105', 'Valrico Plain Salt',                           'grocery', 'each', 'each',  29.25, 'T', '24/26oz CS'),
  ('BWA-384-1110', 'Valrico Iodized Salt',                         'grocery', 'each', 'each',  29.25, 'T', '24/26oz CS'),
  ('BWA-430-0010', 'Morton Salt Plain',                            'grocery', 'each', 'each',  55.40, 'T', '24/26oz CS'),
  ('BWA-430-0020', 'Morton Salt Iodized',                          'grocery', 'each', 'each',  55.40, 'T', '24/26oz CS'),
  ('BWA-430-0025', 'Morton Sea Salt Iodized',                      'grocery', 'each', 'each',  43.95, 'T', '12/26oz CS'),
  ('BWA-430-0030', 'Morton Natures Seasoning',                     'grocery', 'each', 'each',  39.55, 'X', '12/4oz CS'),
  ('BWA-430-0040', 'Morton Salt & Pepper Shaker',                  'grocery', 'each', 'each',  38.45, 'X', '12/5.25oz CS'),
  ('BWA-610-3392', 'Caribbean Dreams Sea Salt',                    'grocery', 'each', 'each',  10.25, 'T', '25/400g CS'),
  -- Canned Peas & Beans (7)
  ('BWA-384-1045', 'Valrico Beans Red Kidney',                     'grocery', 'each', 'each',  34.85, 'X', '24/15oz CS'),
  ('BWA-384-1050', 'Valrico Blackeye Peas',                        'grocery', 'each', 'each',  31.35, 'X', '24/15oz CS'),
  ('BWA-384-1055', 'Valrico Chick Peas',                           'grocery', 'each', 'each',  37.74, 'X', '24/15oz CS'),
  ('BWA-384-1060', 'Valrico Sweet Peas',                           'grocery', 'each', 'each',  35.15, 'X', '24/15oz CS'),
  ('BWA-384-1080', 'Valrico Green Pigeon Peas',                    'grocery', 'each', 'each',  36.80, 'X', '24/15oz CS'),
  ('BWA-384-1085', 'Valrico Brown Pigeon Peas',                    'grocery', 'each', 'each',  25.85, 'X', '24/15oz CS'),
  ('BWA-384-1090', 'Valrico Peas & Carrots',                       'grocery', 'each', 'each',  36.20, 'X', '24/15oz CS'),
  -- Tuna & Canned Fish (9)
  ('BWA-129-0070', 'Starkist Chunk Light Tuna in Water Pouches',   'grocery', 'each', 'each',  20.50, 'X', '10/2.6oz CS'),
  ('BWA-630-1000', 'Bright Star Tuna in Water',                    'grocery', 'each', 'each',  38.67, 'X', '48/5oz CS'),
  ('BWA-630-1010', 'Bright Star Tuna in Water 66oz Tin',           'grocery', 'each', 'each',   7.52, 'X', '66oz TIN'),
  ('BWA-384-1135', 'Valrico Salmon Pink',                          'grocery', 'each', 'each', 112.11, 'X', '24/14.75oz CS'),
  ('BWA-384-1140', 'Valrico Mackerel in Water',                    'grocery', 'each', 'each',  56.90, 'X', '24/15oz CS'),
  ('BWA-384-1145', 'Valrico Mackerel in Tomato Sauce',             'grocery', 'each', 'each',  56.90, 'X', '24/15oz CS'),
  ('BWA-610-3300', 'C''Dreams Sardines in Oil',                    'grocery', 'each', 'each',  29.35, 'X', '24/106g CS'),
  ('BWA-610-3305', 'C''Dreams Sardines in Water',                  'grocery', 'each', 'each',  22.74, 'X', '24/106g CS'),
  ('BWA-610-3310', 'C''Dreams Sardines in Tomato Sauce',           'grocery', 'each', 'each',  23.10, 'X', '24/106g CS'),
  -- Meat & Proteins (14)
  ('BWA-415-5972', 'MB Beef Burger Patties 40/4oz',                'meat',    'each', 'each',  49.05, 'X', '10lb CS'),
  ('BWA-415-6100', 'MB Beef Burger Patties 27/6oz',                'meat',    'each', 'each',  50.10, 'X', '10.125lb CS'),
  ('BWA-415-6140', 'MB Beef Burger Patties 20/8oz',                'meat',    'each', 'each',  48.90, 'X', '10lb CS'),
  ('BWA-415-6410', 'MB Ground Beef',                               'meat',    'each', 'each',  39.30, 'X', '10lb (4) STICK'),
  ('BWA-122-0050', 'Sheep Tongue Aust Long Cut',                   'meat',    'each', 'each', 205.39, 'X', '25kg CS'),
  ('BWA-122-0110', 'Spareribs',                                    'meat',    'each', 'each',  49.50, 'X', '10kg CS'),
  ('BWA-100-0100', 'Salty Sausage',                                'meat',    'each', 'each',  92.40, 'X', '24/300g CS'),
  ('BWA-620-0010', 'Lester Bologna',                               'meat',    'each', 'each',  21.45, 'X', '8-9lb STICK'),
  ('BWA-122-1210', 'Picnic Ham',                                   'meat',    'lb',   'lb',     2.70, 'X', '5-10lb per LB'),
  ('BWA-122-1224', 'Ham (Andy''s)',                                'meat',    'lb',   'lb',     3.00, 'X', '22-25lb per LB'),
  ('BWA-630-0030', 'Triple J Corned Beef',                         'meat',    'each', 'each',  48.10, 'X', '24/12oz CS'),
  ('BWA-630-0500', 'Triple J Pork Luncheon Meat',                  'meat',    'each', 'each',  56.20, 'X', '24/340g CS'),
  ('BWA-630-0510', 'Triple J Chicken Luncheon Meat',               'meat',    'each', 'each',  33.70, 'X', '24/320g CS'),
  ('BWA-384-1195', 'Valrico Chicken Vienna Sausage',               'meat',    'each', 'each',  59.31, 'X', '48/5oz CS'),
  -- Turkey (6) — sold per pound
  ('BWA-122-1618', 'Turkey 16-18lb',                               'meat',    'lb',   'lb',     2.59, 'X', 'per LB'),
  ('BWA-122-1820', 'Turkey 18-20lb',                               'meat',    'lb',   'lb',     2.59, 'X', 'per LB'),
  ('BWA-122-1824', 'Turkey Valley Farms 20-24lb',                  'meat',    'lb',   'lb',     2.59, 'X', 'per LB'),
  ('BWA-122-1826', 'Carolina Young Turkey 20-24lb',                'meat',    'lb',   'lb',     2.59, 'X', 'per LB'),
  ('BWA-122-2020', 'Butterball Turkey 16-20lb',                    'meat',    'lb',   'lb',     2.59, 'X', 'per LB'),
  ('BWA-122-2024', 'Butterball Turkey 20-24lb',                    'meat',    'lb',   'lb',     2.59, 'X', 'per LB'),
  -- Evaporated Milk (1) — coconut only; dairy still TBD with BWA
  ('BWA-610-3290', 'C''Dreams Coconut Evaporated Milk',            'grocery', 'each', 'each',  32.45, 'X', '24/400ml CS');

-- ──────────────────────────────────────────────────────────────────
-- 4. Insert products (skip duplicates by SKU)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO products (
  sku, name, category, unit_of_measure, unit_type,
  is_bsc_processed, primary_supplier_id, status,
  sell_nassau, sell_andros, sell_online, sell_wholesale,
  vat_code, vat_price, pack_size, created_by
)
SELECT
  s.sku, s.name, s.category::product_category, s.unit_of_measure, s.unit_type,
  FALSE,
  (SELECT id FROM suppliers WHERE code = 'BWA' OR name ILIKE '%bahamas wholesale%' LIMIT 1),
  'active',
  FALSE, FALSE, TRUE, FALSE,
  s.vat_code,
  CASE WHEN s.vat_code = 'T' THEN s.cost ELSE NULL END,
  s.pack_size,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM bwa_seed s
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = s.sku);

-- ──────────────────────────────────────────────────────────────────
-- 5. Reconcile existing BWA rows to current source-of-truth values
--    (no-op when nothing to fix; corrects stale pasta cents + salt T-rating
--    if an earlier partial run inserted older numbers)
-- ──────────────────────────────────────────────────────────────────
UPDATE products p
SET vat_code  = s.vat_code,
    vat_price = CASE WHEN s.vat_code = 'T' THEN s.cost ELSE NULL END,
    pack_size = s.pack_size,
    name      = s.name
FROM bwa_seed s
WHERE p.sku = s.sku
  AND (p.vat_code IS DISTINCT FROM s.vat_code
    OR p.pack_size IS DISTINCT FROM s.pack_size
    OR p.name      IS DISTINCT FROM s.name);

-- ──────────────────────────────────────────────────────────────────
-- 6. Insert opening cost rows for products that don't yet have one
-- ──────────────────────────────────────────────────────────────────
INSERT INTO product_costs (
  product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
  shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
  effective_from, is_current, recorded_by
)
SELECT
  p.id,
  (SELECT id FROM suppliers WHERE code = 'BWA' OR name ILIKE '%bahamas wholesale%' LIMIT 1),
  'opening_balance',
  s.cost,
  s.unit_of_measure,
  0, 0, 0, 0,
  NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM bwa_seed s
JOIN products p ON p.sku = s.sku
WHERE NOT EXISTS (
  SELECT 1 FROM product_costs pc
  WHERE pc.product_id = p.id AND pc.is_current = TRUE
);

-- NOTE: product_costs has a "no UPDATE" trigger (prevent_cost_modification)
-- enforcing cost-history immutability. We cannot refresh existing cost rows
-- in place — they would need to be superseded (new current row + old marked
-- not-current). Skipping the refresh here keeps this migration purely
-- additive and safe to re-run. If a stale cost value needs updating, do it
-- via the products page Edit modal (which fans out to a proper supersede).

-- ──────────────────────────────────────────────────────────────────
-- 7. Insert online_market pricing rows for products that don't yet have one
-- ──────────────────────────────────────────────────────────────────
INSERT INTO product_pricing (
  product_id, channel, pricing_mode, margin_multiplier, vat_multiplier,
  manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct,
  per_transaction_fee, service_fee_pct,
  effective_from, is_current, is_active, recorded_by
)
SELECT
  p.id,
  'online_market',
  'manual_override',
  1.0, 1.0,
  ROUND(
    CASE WHEN s.vat_code = 'T'
      THEN s.cost / 0.75
      ELSE s.cost / 0.75 * 1.10
    END, 2),
  0, 0, 0, 0, 0,
  NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM bwa_seed s
JOIN products p ON p.sku = s.sku
WHERE NOT EXISTS (
  SELECT 1 FROM product_pricing pp
  WHERE pp.product_id = p.id
    AND pp.channel = 'online_market'
    AND pp.is_current = TRUE
);

-- Recompute online_market pricing for every BWA item from current cost + vat_code
-- (fixes any pricing row whose underlying cost was just updated)
UPDATE product_pricing pp
SET manual_unit_price = ROUND(
      CASE WHEN p.vat_code = 'T'
        THEN pc.cost_per_unit / 0.75
        ELSE pc.cost_per_unit / 0.75 * 1.10
      END, 2)
FROM products p
JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
WHERE pp.product_id = p.id
  AND pp.channel = 'online_market'
  AND pp.is_current = TRUE
  AND p.sku LIKE 'BWA-%';

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- 8. Verification (read-only)
-- ──────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM suppliers      WHERE code = 'BWA' OR name ILIKE '%bahamas wholesale%')                                  AS bwa_supplier_count,
  (SELECT COUNT(*) FROM products       WHERE sku LIKE 'BWA-%')                                                                  AS bwa_products,
  (SELECT COUNT(*) FROM product_costs   pc JOIN products p ON p.id = pc.product_id WHERE p.sku LIKE 'BWA-%' AND pc.is_current)  AS bwa_cost_rows,
  (SELECT COUNT(*) FROM product_pricing pp JOIN products p ON p.id = pp.product_id WHERE p.sku LIKE 'BWA-%' AND pp.channel = 'online_market' AND pp.is_current) AS bwa_pricing_rows,
  (SELECT COUNT(*) FROM products       WHERE sku LIKE 'BWA-%' AND vat_code = 'T') AS bwa_t_rated;

-- Sample preview (all 98 rows)
SELECT p.sku, p.name, p.category, p.vat_code, p.pack_size,
       pc.cost_per_unit AS cost,
       pp.manual_unit_price AS online_sell
FROM products p
LEFT JOIN product_costs   pc ON pc.product_id = p.id AND pc.is_current = TRUE
LEFT JOIN product_pricing pp ON pp.product_id = p.id AND pp.channel = 'online_market' AND pp.is_current = TRUE
WHERE p.sku LIKE 'BWA-%'
ORDER BY p.category, p.sku;
