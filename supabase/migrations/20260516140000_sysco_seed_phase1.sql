-- BSC × Sysco Bahamas — seed of approved Sysco items
-- Date: 2026-05-16
-- Source: SYSCO_Bahamas_BSC_Catalog_FULL_2026.docx (BSC founder, 5/16/2026)
--
-- Catalog totals: 59 captured items
--   • Inserted active   (49): full cost + in-stock
--   • Inserted inactive (4):  status = 'inactive' (Out of stock per catalog)
--   • Skipped           (6):  1 "Market Price" (Ribeye No Roll 7203101)
--                             5 "Not visible" (cost/pack/sku blocked in screenshot)
--
-- Per-LB items (beef cuts): cost stored as $/LB, unit_of_measure = 'lb'.
-- Per-CS items (everything else): cost stored as case price, unit_of_measure = 'each'.
--
-- Channel: online_market only. Other channels stay off; founder can toggle later.
--
-- Sell price formula (all Sysco items assumed VAT-exempt X — no T flag in catalog):
--   sell = cost / 0.75 * 1.10            (25% margin + 10% VAT)
--
-- Idempotent: WHERE NOT EXISTS guards on every insert, recompute pass at the end.

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1. Ensure Sysco Bahamas supplier row exists
-- ──────────────────────────────────────────────────────────────────
INSERT INTO suppliers (name, code, is_active, created_at)
SELECT 'Sysco Bahamas', 'SYSCO', TRUE, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers
  WHERE code = 'SYSCO' OR name ILIKE '%sysco%'
);

-- ──────────────────────────────────────────────────────────────────
-- 2. Stage 53 items in temp table
-- ──────────────────────────────────────────────────────────────────
CREATE TEMP TABLE sysco_seed (
  sku             TEXT,
  name            TEXT,
  category        TEXT,
  unit_of_measure TEXT,
  unit_type       TEXT,
  cost            NUMERIC(10,4),
  vat_code        CHAR(1),
  pack_size       TEXT,
  status          TEXT
) ON COMMIT DROP;

INSERT INTO sysco_seed VALUES
  -- ── Beef & Steak (15 per-LB, 5 per-CS; 18 active + 2 inactive) ──
  ('SYSCO-1647353', 'Sysco Classic Chicken Fajita Breast Strips Fully Cooked',                'meat', 'each', 'each',  64.7900,  'X', '2/5LB',         'active'),
  ('SYSCO-7175245', 'Two Rivers Steak Fillet Beef Fat Added 8 Ounce',                         'meat', 'lb',   'lb',    20.7520,  'X', '20/8 OZ',       'active'),
  ('SYSCO-3791730', 'Packer Beef Flank Steak',                                                'meat', 'lb',   'lb',     5.2170,  'X', '1/55-66#',      'active'),
  ('SYSCO-3174998', 'Two Rivers Beef Flank Steak No-roll',                                    'meat', 'lb',   'lb',    12.3240,  'X', '5/11#AVG',      'active'),
  ('SYSCO-8618203', 'Certified Angus Beef Flank Steak',                                       'meat', 'lb',   'lb',    13.9320,  'X', '2/10#',         'active'),
  ('SYSCO-3468519', 'Buckhead Pride Steak Porterhouse 1in Tail Choice Frozen',                'meat', 'lb',   'lb',    27.9250,  'X', '8/22 OZ',       'active'),
  ('SYSCO-4225037', 'CAB Buckhead Pride Steak Ribeye Bone In Longbone Frenched Frozen',       'meat', 'lb',   'lb',    38.7230,  'X', '7/26-30Z',      'active'),
  ('SYSCO-4810511', 'Buckhead Pride Steak Ribeye Boneless 1in Tail Choice Frozen',            'meat', 'lb',   'lb',    41.0640,  'X', '12/14ZAVG',     'active'),
  ('SYSCO-5237802', 'CAB Buckhead Pride Steak Ribeye Boneless 1in Tail',                      'meat', 'lb',   'lb',    31.5440,  'X', '16/12 OZ',      'active'),
  ('SYSCO-7276296', 'Catelli Brothers Beef Rib Aged Tomahawk AAA+ Frozen',                    'meat', 'lb',   'lb',    27.0270,  'X', '4/1 PC',        'active'),
  ('SYSCO-5108842', 'Harrys Finest Beef Steak New York Strip',                                'meat', 'lb',   'lb',    15.1270,  'X', '1/9-11#A',      'active'),
  ('SYSCO-8204596', 'CAB Buckhead Pride Steak Strip Center Cut 1in Tail CAB',                 'meat', 'lb',   'lb',    37.7530,  'X', '16/12 OZ',      'active'),
  ('SYSCO-5727520', 'Buckhead Pride Steak Strip Center-cut 1in Tail Choice Frozen',           'meat', 'lb',   'lb',    30.3840,  'X', '16/10 OZ',      'active'),
  ('SYSCO-0967113', 'Buckhead Pride Steak Strip Center-Cut 1in Tail Choice Frozen',           'meat', 'lb',   'lb',    27.8510,  'X', '16/12 OZ',      'inactive'),
  ('SYSCO-3671591', 'CAB Buckhead Pride Steak Strip Center-cut 1in Tail CAB Frozen',          'meat', 'lb',   'lb',    28.7800,  'X', '16/12 OZ',      'inactive'),
  ('SYSCO-3658011', 'Harrys Finest Steak Strip Economy CAB 8oz',                              'meat', 'lb',   'lb',    13.8620,  'X', '1/9-11#',       'active'),
  ('SYSCO-1978865', 'Sysco Premium Beef Philly Ribeye Flat Marinated',                        'meat', 'each', 'each', 118.8600,  'X', '40/4OZ',        'active'),
  ('SYSCO-4962734', 'Sysco Classic Beef Philly Flat Marinated',                               'meat', 'each', 'each',  99.8300,  'X', '40/4 OZ',       'active'),
  ('SYSCO-7020377', 'Holten Meat Steak Flat Iron Seasoned Choice Frozen',                     'meat', 'each', 'each', 211.7300,  'X', '20/8 OZ',       'active'),
  ('SYSCO-3451646', 'Holten Meat Beef Patty CAB 8oz',                                         'meat', 'each', 'each',  80.0900,  'X', '1/10LB',        'active'),

  -- ── Butter & Margarine (12 active; 2 skipped — Land O Lakes Whipped + President Chip blocked) ──
  ('SYSCO-7095930', 'Dew Fresh Quarters Spread Butter 40% Country Premium',                   'grocery', 'each', 'each',  35.8300, 'X', '18/15 OZ',     'active'),
  ('SYSCO-8808206', 'Land O Lakes Butter Oil Clarified',                                       'grocery', 'each', 'each', 126.9100, 'X', '4/5LB',        'active'),
  ('SYSCO-4832012', 'Sommer Maid Butter Solid Unsalted Grade AA',                              'grocery', 'each', 'each', 126.9000, 'X', '36/1#',        'active'),
  ('SYSCO-3031438', 'Wholesome Farms Imperial Butter Solid Unsalted USDA AA',                  'grocery', 'each', 'each', 151.2400, 'X', '36/1LB',       'active'),
  ('SYSCO-7095795', 'Dew Fresh Quarters Spread Butter 40 Percent',                             'grocery', 'each', 'each',  46.9200, 'X', '12/2 LB',      'active'),
  ('SYSCO-7095798', 'Dew Fresh Quarters Spread Butter 40 Percent',                             'grocery', 'each', 'each',  53.0600, 'X', '12/45 OZ',     'active'),
  ('SYSCO-3824253', 'Vermont Butter Solid Log Lightly Salted',                                 'grocery', 'each', 'each',  91.5600, 'X', '12/1 LB',      'active'),
  ('SYSCO-3029891', 'Wholesome Farms Imperial Butter Cup Whipped 400ct USDA AA',               'grocery', 'each', 'each',  55.9600, 'X', '400/10GR',     'active'),
  ('SYSCO-4549099', 'Sysco Classic Margarine Solid Zero Trans Fat',                            'grocery', 'each', 'each',  59.8100, 'X', '30/1LB',       'active'),
  ('SYSCO-3029739', 'Wholesome Farms Imperial Butter Cup USDA AA',                             'grocery', 'each', 'each',  51.3900, 'X', '720/5 GM',     'active'),
  ('SYSCO-5242348', 'Dew Fresh Quarters Margarine Quarter',                                    'grocery', 'each', 'each',  53.0600, 'X', '30/1 LB',      'active'),
  ('SYSCO-3030816', 'Wholesome Farms Imperial Butter Solid Salted USDA AA',                    'grocery', 'each', 'each', 118.8900, 'X', '36/1LB',       'active'),

  -- ── Dairy - Milk & Cream (10 active; 1 skipped — Packer Whole Pint blocked) ──
  ('SYSCO-3824107', 'Cardinal Intl Milk Evaporated',                                           'grocery', 'each', 'each',  56.4700, 'X', '96/170 GR',    'active'),
  ('SYSCO-7252298', 'Carnation Milk Evaporated',                                               'grocery', 'each', 'each',  69.5800, 'X', '48/395 GR',    'active'),
  ('SYSCO-8429201', 'Packer Milk Whole Homogenized',                                           'grocery', 'each', 'each',  41.3500, 'X', '1/5 GAL',      'active'),
  ('SYSCO-2560092', 'Packer Milk Homogenized',                                                 'grocery', 'each', 'each',  35.4000, 'X', '4/1 GAL',      'active'),
  ('SYSCO-7470518', 'Catering By Gloria Milk Whole 946ml',                                     'grocery', 'each', 'each',  23.5500, 'X', '12/946 ML',    'active'),
  ('SYSCO-7122124', 'Packer Milk Homogenized Cream O Land Half Gallon',                        'grocery', 'each', 'each',  41.7400, 'X', '9/64 FOZ',     'active'),
  ('SYSCO-7122128', 'Packer Milk 1% Buttermilk DairyPure Half Gallon',                         'grocery', 'each', 'each',  59.2400, 'X', '9/64 FOZ',     'active'),
  ('SYSCO-7122123', 'Packer Milk Skim Cream O Land Half Gallon',                               'grocery', 'each', 'each',  39.8800, 'X', '9/64 FOZ',     'active'),
  ('SYSCO-7122125', 'Packer Milk 2% Cream O Land Half Gallon',                                 'grocery', 'each', 'each',  41.3100, 'X', '9/64 FOZ',     'active'),
  ('SYSCO-4828802', 'Wholesome Farms Classic Heavy Whipping Cream 36% ESL',                    'grocery', 'each', 'each',  67.2600, 'X', '12/32OZ',      'active'),

  -- ── Dry Goods & Sauces (1 active + 1 inactive) ──
  ('SYSCO-9337601', 'Crystal Food Products Sauce Steak Original',                              'grocery', 'each', 'each', 124.3100, 'X', '2/1 GAL',      'inactive'),
  ('SYSCO-3276021', 'First Choice Sugar Granulated White Fine',                                'grocery', 'each', 'each',  21.1300, 'X', '8/4 LB',       'active'),

  -- ── Egg Products (6 active + 1 inactive; 2 skipped — Sandwich Patty + Quail blocked) ──
  ('SYSCO-7305997', 'Organic Valley Egg Shell Ex-large Organic Grade A 15 Dozen',              'grocery', 'each', 'each', 104.5000, 'X', '15/1 DZ',      'active'),
  ('SYSCO-6764700', 'Papettis Egg Hard Boiled Whole Peeled Table Ready',                       'grocery', 'each', 'each', 105.3000, 'X', '1/25 LB',      'active'),
  ('SYSCO-1777309', 'Papettis Egg Yolk Liquid Fresh',                                          'grocery', 'each', 'each',  87.8500, 'X', '15/2LB',       'active'),
  ('SYSCO-7262174', 'Wholesome Farms Classic Egg Shell Med AA USDA 1 Dozen Carton',            'grocery', 'each', 'each',  26.7200, 'X', '30/1 DZ',      'active'),
  ('SYSCO-3029222', 'Papettis Egg Fried Patty With Black Pepper',                              'grocery', 'each', 'each',  83.4500, 'X', '168/1.5 OZ',   'inactive'),
  ('SYSCO-1915420', 'Packer Egg Shell Medium White Carton',                                    'grocery', 'each', 'each',  36.5500, 'X', '30/1 DOZ',     'active'),
  ('SYSCO-7262197', 'Wholesome Farms Classic Egg Shell Lg AA USDA 1 Dozen Carton',             'grocery', 'each', 'each',  25.6500, 'X', '30/1 DZ',      'active'),

  -- ── Seafood (2 active) ──
  ('SYSCO-7472784', 'Packer Caviar Tobiko Red Frozen',                                         'fresh_seafood', 'each', 'each',  55.5600, 'X', '1/1.1LB',      'active'),
  ('SYSCO-3363492', 'Sea Best Seafood Crab Imitation Flaked',                                  'fresh_seafood', 'each', 'each', 101.9800, 'X', '20/1 LB',      'active');

-- ──────────────────────────────────────────────────────────────────
-- 3. Insert products (skip duplicates by SKU)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO products (
  sku, name, category, unit_of_measure, unit_type,
  is_bsc_processed, primary_supplier_id, status,
  sell_nassau, sell_andros, sell_online, sell_wholesale,
  vat_code, pack_size, created_by
)
SELECT
  s.sku, s.name, s.category::product_category, s.unit_of_measure, s.unit_type,
  FALSE,
  (SELECT id FROM suppliers WHERE code = 'SYSCO' OR name ILIKE '%sysco%' LIMIT 1),
  s.status,
  FALSE, FALSE, (s.status = 'active'), FALSE,
  s.vat_code,
  s.pack_size,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM sysco_seed s
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = s.sku);

-- ──────────────────────────────────────────────────────────────────
-- 4. Insert opening cost rows
-- ──────────────────────────────────────────────────────────────────
INSERT INTO product_costs (
  product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
  shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
  effective_from, is_current, recorded_by
)
SELECT
  p.id,
  (SELECT id FROM suppliers WHERE code = 'SYSCO' OR name ILIKE '%sysco%' LIMIT 1),
  'opening_balance',
  s.cost,
  s.unit_of_measure,
  0, 0, 0, 0,
  NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM sysco_seed s
JOIN products p ON p.sku = s.sku
WHERE NOT EXISTS (
  SELECT 1 FROM product_costs pc
  WHERE pc.product_id = p.id AND pc.is_current = TRUE
);

-- ──────────────────────────────────────────────────────────────────
-- 5. Insert online_market pricing rows for ACTIVE items only
--    (inactive Out-of-stock items get no pricing row until reactivated)
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
  ROUND((s.cost / 0.75 * 1.10)::numeric, 2),
  0, 0, 0, 0, 0,
  NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM sysco_seed s
JOIN products p ON p.sku = s.sku
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM product_pricing pp
    WHERE pp.product_id = p.id
      AND pp.channel = 'online_market'
      AND pp.is_current = TRUE
  );

-- Recompute pricing for every Sysco active item from current cost
UPDATE product_pricing pp
SET manual_unit_price = ROUND((pc.cost_per_unit / 0.75 * 1.10)::numeric, 2)
FROM products p
JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
WHERE pp.product_id = p.id
  AND pp.channel = 'online_market'
  AND pp.is_current = TRUE
  AND p.sku LIKE 'SYSCO-%'
  AND p.status = 'active';

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- 6. Verification (read-only)
-- ──────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM suppliers      WHERE code = 'SYSCO' OR name ILIKE '%sysco%')                                   AS sysco_supplier_count,
  (SELECT COUNT(*) FROM products       WHERE sku LIKE 'SYSCO-%')                                                       AS sysco_products,
  (SELECT COUNT(*) FROM products       WHERE sku LIKE 'SYSCO-%' AND status = 'active')                                 AS sysco_active,
  (SELECT COUNT(*) FROM products       WHERE sku LIKE 'SYSCO-%' AND status = 'inactive')                               AS sysco_inactive,
  (SELECT COUNT(*) FROM product_costs   pc JOIN products p ON p.id = pc.product_id WHERE p.sku LIKE 'SYSCO-%' AND pc.is_current) AS sysco_cost_rows,
  (SELECT COUNT(*) FROM product_pricing pp JOIN products p ON p.id = pp.product_id WHERE p.sku LIKE 'SYSCO-%' AND pp.channel = 'online_market' AND pp.is_current) AS sysco_pricing_rows;

-- Sample preview (all 53 rows)
SELECT p.sku, p.name, p.category, p.status, p.unit_of_measure,
       pc.cost_per_unit AS cost,
       pp.manual_unit_price AS online_sell
FROM products p
LEFT JOIN product_costs   pc ON pc.product_id = p.id AND pc.is_current = TRUE
LEFT JOIN product_pricing pp ON pp.product_id = p.id AND pp.channel = 'online_market' AND pp.is_current = TRUE
WHERE p.sku LIKE 'SYSCO-%'
ORDER BY p.category, p.status, p.sku;
