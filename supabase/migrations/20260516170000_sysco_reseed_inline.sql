-- Sysco re-seed without temp tables. Three self-contained INSERTs:
--   PART A — 53 product rows
--   PART B — 53 opening cost rows
--   PART C — 49 online_market pricing rows (active items only)
--
-- Each part is idempotent (WHERE NOT EXISTS). Safe to re-run.
-- Run ALL THREE parts in one paste.

-- ════════════════════════════════════════════════════════════════════
-- PART A — Insert 53 Sysco product rows
-- ════════════════════════════════════════════════════════════════════
INSERT INTO products (
  sku, name, category, unit_of_measure, unit_type,
  is_bsc_processed, primary_supplier_id, status,
  sell_nassau, sell_andros, sell_online, sell_wholesale,
  vat_code, pack_size, created_by
)
SELECT
  v.sku, v.name, v.category::product_category, v.unit_of_measure, v.unit_type,
  FALSE,
  (SELECT id FROM suppliers WHERE code = 'SYSCO' OR name ILIKE '%sysco%' ORDER BY (code = 'SYSCO') DESC LIMIT 1),
  'active'::product_status,  -- enum doesn't include 'inactive'; OOS items use sell_online=false instead
  FALSE, FALSE, (v.status = 'active'), FALSE,
  'X',
  v.pack_size,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM (VALUES
  -- Beef & Steak (20)
  ('SYSCO-1647353', 'Sysco Classic Chicken Fajita Breast Strips Fully Cooked',                'meat', 'each', 'each', '2/5LB',         'active'::text),
  ('SYSCO-7175245', 'Two Rivers Steak Fillet Beef Fat Added 8 Ounce',                         'meat', 'lb',   'lb',   '20/8 OZ',       'active'),
  ('SYSCO-3791730', 'Packer Beef Flank Steak',                                                'meat', 'lb',   'lb',   '1/55-66#',      'active'),
  ('SYSCO-3174998', 'Two Rivers Beef Flank Steak No-roll',                                    'meat', 'lb',   'lb',   '5/11#AVG',      'active'),
  ('SYSCO-8618203', 'Certified Angus Beef Flank Steak',                                       'meat', 'lb',   'lb',   '2/10#',         'active'),
  ('SYSCO-3468519', 'Buckhead Pride Steak Porterhouse 1in Tail Choice Frozen',                'meat', 'lb',   'lb',   '8/22 OZ',       'active'),
  ('SYSCO-4225037', 'CAB Buckhead Pride Steak Ribeye Bone In Longbone Frenched Frozen',       'meat', 'lb',   'lb',   '7/26-30Z',      'active'),
  ('SYSCO-4810511', 'Buckhead Pride Steak Ribeye Boneless 1in Tail Choice Frozen',            'meat', 'lb',   'lb',   '12/14ZAVG',     'active'),
  ('SYSCO-5237802', 'CAB Buckhead Pride Steak Ribeye Boneless 1in Tail',                      'meat', 'lb',   'lb',   '16/12 OZ',      'active'),
  ('SYSCO-7276296', 'Catelli Brothers Beef Rib Aged Tomahawk AAA+ Frozen',                    'meat', 'lb',   'lb',   '4/1 PC',        'active'),
  ('SYSCO-5108842', 'Harrys Finest Beef Steak New York Strip',                                'meat', 'lb',   'lb',   '1/9-11#A',      'active'),
  ('SYSCO-8204596', 'CAB Buckhead Pride Steak Strip Center Cut 1in Tail CAB',                 'meat', 'lb',   'lb',   '16/12 OZ',      'active'),
  ('SYSCO-5727520', 'Buckhead Pride Steak Strip Center-cut 1in Tail Choice Frozen',           'meat', 'lb',   'lb',   '16/10 OZ',      'active'),
  ('SYSCO-0967113', 'Buckhead Pride Steak Strip Center-Cut 1in Tail Choice Frozen',           'meat', 'lb',   'lb',   '16/12 OZ',      'inactive'),
  ('SYSCO-3671591', 'CAB Buckhead Pride Steak Strip Center-cut 1in Tail CAB Frozen',          'meat', 'lb',   'lb',   '16/12 OZ',      'inactive'),
  ('SYSCO-3658011', 'Harrys Finest Steak Strip Economy CAB 8oz',                              'meat', 'lb',   'lb',   '1/9-11#',       'active'),
  ('SYSCO-1978865', 'Sysco Premium Beef Philly Ribeye Flat Marinated',                        'meat', 'each', 'each', '40/4OZ',        'active'),
  ('SYSCO-4962734', 'Sysco Classic Beef Philly Flat Marinated',                               'meat', 'each', 'each', '40/4 OZ',       'active'),
  ('SYSCO-7020377', 'Holten Meat Steak Flat Iron Seasoned Choice Frozen',                     'meat', 'each', 'each', '20/8 OZ',       'active'),
  ('SYSCO-3451646', 'Holten Meat Beef Patty CAB 8oz',                                         'meat', 'each', 'each', '1/10LB',        'active'),
  -- Butter & Margarine (12)
  ('SYSCO-7095930', 'Dew Fresh Quarters Spread Butter 40% Country Premium',                   'grocery', 'each', 'each', '18/15 OZ',     'active'),
  ('SYSCO-8808206', 'Land O Lakes Butter Oil Clarified',                                       'grocery', 'each', 'each', '4/5LB',        'active'),
  ('SYSCO-4832012', 'Sommer Maid Butter Solid Unsalted Grade AA',                              'grocery', 'each', 'each', '36/1#',        'active'),
  ('SYSCO-3031438', 'Wholesome Farms Imperial Butter Solid Unsalted USDA AA',                  'grocery', 'each', 'each', '36/1LB',       'active'),
  ('SYSCO-7095795', 'Dew Fresh Quarters Spread Butter 40 Percent',                             'grocery', 'each', 'each', '12/2 LB',      'active'),
  ('SYSCO-7095798', 'Dew Fresh Quarters Spread Butter 40 Percent',                             'grocery', 'each', 'each', '12/45 OZ',     'active'),
  ('SYSCO-3824253', 'Vermont Butter Solid Log Lightly Salted',                                 'grocery', 'each', 'each', '12/1 LB',      'active'),
  ('SYSCO-3029891', 'Wholesome Farms Imperial Butter Cup Whipped 400ct USDA AA',               'grocery', 'each', 'each', '400/10GR',     'active'),
  ('SYSCO-4549099', 'Sysco Classic Margarine Solid Zero Trans Fat',                            'grocery', 'each', 'each', '30/1LB',       'active'),
  ('SYSCO-3029739', 'Wholesome Farms Imperial Butter Cup USDA AA',                             'grocery', 'each', 'each', '720/5 GM',     'active'),
  ('SYSCO-5242348', 'Dew Fresh Quarters Margarine Quarter',                                    'grocery', 'each', 'each', '30/1 LB',      'active'),
  ('SYSCO-3030816', 'Wholesome Farms Imperial Butter Solid Salted USDA AA',                    'grocery', 'each', 'each', '36/1LB',       'active'),
  -- Dairy (10)
  ('SYSCO-3824107', 'Cardinal Intl Milk Evaporated',                                           'grocery', 'each', 'each', '96/170 GR',    'active'),
  ('SYSCO-7252298', 'Carnation Milk Evaporated',                                               'grocery', 'each', 'each', '48/395 GR',    'active'),
  ('SYSCO-8429201', 'Packer Milk Whole Homogenized',                                           'grocery', 'each', 'each', '1/5 GAL',      'active'),
  ('SYSCO-2560092', 'Packer Milk Homogenized',                                                 'grocery', 'each', 'each', '4/1 GAL',      'active'),
  ('SYSCO-7470518', 'Catering By Gloria Milk Whole 946ml',                                     'grocery', 'each', 'each', '12/946 ML',    'active'),
  ('SYSCO-7122124', 'Packer Milk Homogenized Cream O Land Half Gallon',                        'grocery', 'each', 'each', '9/64 FOZ',     'active'),
  ('SYSCO-7122128', 'Packer Milk 1% Buttermilk DairyPure Half Gallon',                         'grocery', 'each', 'each', '9/64 FOZ',     'active'),
  ('SYSCO-7122123', 'Packer Milk Skim Cream O Land Half Gallon',                               'grocery', 'each', 'each', '9/64 FOZ',     'active'),
  ('SYSCO-7122125', 'Packer Milk 2% Cream O Land Half Gallon',                                 'grocery', 'each', 'each', '9/64 FOZ',     'active'),
  ('SYSCO-4828802', 'Wholesome Farms Classic Heavy Whipping Cream 36% ESL',                    'grocery', 'each', 'each', '12/32OZ',      'active'),
  -- Dry Goods (2)
  ('SYSCO-9337601', 'Crystal Food Products Sauce Steak Original',                              'grocery', 'each', 'each', '2/1 GAL',      'inactive'),
  ('SYSCO-3276021', 'First Choice Sugar Granulated White Fine',                                'grocery', 'each', 'each', '8/4 LB',       'active'),
  -- Eggs (7)
  ('SYSCO-7305997', 'Organic Valley Egg Shell Ex-large Organic Grade A 15 Dozen',              'grocery', 'each', 'each', '15/1 DZ',      'active'),
  ('SYSCO-6764700', 'Papettis Egg Hard Boiled Whole Peeled Table Ready',                       'grocery', 'each', 'each', '1/25 LB',      'active'),
  ('SYSCO-1777309', 'Papettis Egg Yolk Liquid Fresh',                                          'grocery', 'each', 'each', '15/2LB',       'active'),
  ('SYSCO-7262174', 'Wholesome Farms Classic Egg Shell Med AA USDA 1 Dozen Carton',            'grocery', 'each', 'each', '30/1 DZ',      'active'),
  ('SYSCO-3029222', 'Papettis Egg Fried Patty With Black Pepper',                              'grocery', 'each', 'each', '168/1.5 OZ',   'inactive'),
  ('SYSCO-1915420', 'Packer Egg Shell Medium White Carton',                                    'grocery', 'each', 'each', '30/1 DOZ',     'active'),
  ('SYSCO-7262197', 'Wholesome Farms Classic Egg Shell Lg AA USDA 1 Dozen Carton',             'grocery', 'each', 'each', '30/1 DZ',      'active'),
  -- Seafood (2)
  ('SYSCO-7472784', 'Packer Caviar Tobiko Red Frozen',                                         'fresh_seafood', 'each', 'each', '1/1.1LB', 'active'),
  ('SYSCO-3363492', 'Sea Best Seafood Crab Imitation Flaked',                                  'fresh_seafood', 'each', 'each', '20/1 LB', 'active')
) AS v(sku, name, category, unit_of_measure, unit_type, pack_size, status)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = v.sku);

-- Quick check after Part A
SELECT 'after_part_a' AS phase, COUNT(*) AS sysco_products FROM products WHERE sku LIKE 'SYSCO-%';

-- ════════════════════════════════════════════════════════════════════
-- PART B — Opening cost rows (53)
-- ════════════════════════════════════════════════════════════════════
INSERT INTO product_costs (
  product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
  shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
  effective_from, is_current, recorded_by
)
SELECT
  p.id,
  (SELECT id FROM suppliers WHERE code = 'SYSCO' OR name ILIKE '%sysco%' ORDER BY (code = 'SYSCO') DESC LIMIT 1),
  'opening_balance',
  v.cost,
  p.unit_of_measure,
  0, 0, 0, 0,
  NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM (VALUES
  ('SYSCO-1647353',  64.7900::numeric),
  ('SYSCO-7175245',  20.7520),
  ('SYSCO-3791730',   5.2170),
  ('SYSCO-3174998',  12.3240),
  ('SYSCO-8618203',  13.9320),
  ('SYSCO-3468519',  27.9250),
  ('SYSCO-4225037',  38.7230),
  ('SYSCO-4810511',  41.0640),
  ('SYSCO-5237802',  31.5440),
  ('SYSCO-7276296',  27.0270),
  ('SYSCO-5108842',  15.1270),
  ('SYSCO-8204596',  37.7530),
  ('SYSCO-5727520',  30.3840),
  ('SYSCO-0967113',  27.8510),
  ('SYSCO-3671591',  28.7800),
  ('SYSCO-3658011',  13.8620),
  ('SYSCO-1978865', 118.8600),
  ('SYSCO-4962734',  99.8300),
  ('SYSCO-7020377', 211.7300),
  ('SYSCO-3451646',  80.0900),
  ('SYSCO-7095930',  35.8300),
  ('SYSCO-8808206', 126.9100),
  ('SYSCO-4832012', 126.9000),
  ('SYSCO-3031438', 151.2400),
  ('SYSCO-7095795',  46.9200),
  ('SYSCO-7095798',  53.0600),
  ('SYSCO-3824253',  91.5600),
  ('SYSCO-3029891',  55.9600),
  ('SYSCO-4549099',  59.8100),
  ('SYSCO-3029739',  51.3900),
  ('SYSCO-5242348',  53.0600),
  ('SYSCO-3030816', 118.8900),
  ('SYSCO-3824107',  56.4700),
  ('SYSCO-7252298',  69.5800),
  ('SYSCO-8429201',  41.3500),
  ('SYSCO-2560092',  35.4000),
  ('SYSCO-7470518',  23.5500),
  ('SYSCO-7122124',  41.7400),
  ('SYSCO-7122128',  59.2400),
  ('SYSCO-7122123',  39.8800),
  ('SYSCO-7122125',  41.3100),
  ('SYSCO-4828802',  67.2600),
  ('SYSCO-9337601', 124.3100),
  ('SYSCO-3276021',  21.1300),
  ('SYSCO-7305997', 104.5000),
  ('SYSCO-6764700', 105.3000),
  ('SYSCO-1777309',  87.8500),
  ('SYSCO-7262174',  26.7200),
  ('SYSCO-3029222',  83.4500),
  ('SYSCO-1915420',  36.5500),
  ('SYSCO-7262197',  25.6500),
  ('SYSCO-7472784',  55.5600),
  ('SYSCO-3363492', 101.9800)
) AS v(sku, cost)
JOIN products p ON p.sku = v.sku
WHERE NOT EXISTS (
  SELECT 1 FROM product_costs pc WHERE pc.product_id = p.id AND pc.is_current = TRUE
);

SELECT 'after_part_b' AS phase, COUNT(*) AS sysco_cost_rows
FROM product_costs pc JOIN products p ON p.id = pc.product_id
WHERE p.sku LIKE 'SYSCO-%' AND pc.is_current = TRUE;

-- ════════════════════════════════════════════════════════════════════
-- PART C — Online market pricing rows (49 active items)
--   Formula: sell = cost / 0.75 * 1.10  (25% margin + 10% VAT, X items)
-- ════════════════════════════════════════════════════════════════════
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
  ROUND((pc.cost_per_unit / 0.75 * 1.10)::numeric, 2),
  0, 0, 0, 0, 0,
  NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM products p
JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
WHERE p.sku LIKE 'SYSCO-%'
  AND p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM product_pricing pp
    WHERE pp.product_id = p.id AND pp.channel = 'online_market' AND pp.is_current = TRUE
  );

-- Final verification
SELECT 'FINAL' AS phase,
  (SELECT COUNT(*) FROM products WHERE sku LIKE 'SYSCO-%')                                                                                                      AS sysco_products,
  (SELECT COUNT(*) FROM products WHERE sku LIKE 'SYSCO-%' AND sell_online = TRUE)                                                                               AS sysco_on_online,
  (SELECT COUNT(*) FROM products WHERE sku LIKE 'SYSCO-%' AND sell_online = FALSE)                                                                              AS sysco_off_online,
  (SELECT COUNT(*) FROM product_costs   pc JOIN products p ON p.id = pc.product_id WHERE p.sku LIKE 'SYSCO-%' AND pc.is_current)                                AS sysco_cost_rows,
  (SELECT COUNT(*) FROM product_pricing pp JOIN products p ON p.id = pp.product_id WHERE p.sku LIKE 'SYSCO-%' AND pp.channel='online_market' AND pp.is_current) AS sysco_pricing_rows;
