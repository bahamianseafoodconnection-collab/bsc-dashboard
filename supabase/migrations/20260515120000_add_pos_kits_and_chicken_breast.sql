-- Adds three Nassau-POS-only products with fixed cost/sell prices:
--   1. 30lb Lane Snapper Kit   (LS-KIT-30)   — 30 lb, cost $180.00, sell $240.00
--   2. Half Kit Lane Snapper   (LS-KIT-15)   — 15 lb, cost $90.00,  sell $125.00
--   3. Case Chicken Breast     (CHK-CASE-BB) — supplier Bahama Breeze, cost $57.93, sell $64.90
--
-- Notes:
--   • Supplier "Bahama Breeze" is matched by name (case-insensitive) on the
--     suppliers table. If it doesn't exist, the chicken-breast inserts roll back.
--   • All three rows are flagged Nassau POS only (sell_nassau=true, others false).
--   • Pricing rows use manual_override mode so the exact prices are honored.
--   • created_by/recorded_by = founder UUID (Dedrick).

BEGIN;

-- Step 1: insert the three product rows

-- category is an enum (product_category) — inherit from an existing Lane Snapper row
-- so we use a value the enum actually accepts. Fails fast if no Lane Snapper exists.

INSERT INTO products (sku, name, category, unit_of_measure, is_bsc_processed, status, sell_nassau, sell_andros, sell_online, sell_wholesale, created_by)
VALUES (
  'LS-KIT-30',
  '30lb Lane Snapper Kit',
  (SELECT category FROM products WHERE name ILIKE '%lane snapper%' AND status = 'active' LIMIT 1),
  'kit',
  FALSE,
  'active', TRUE, FALSE, FALSE, FALSE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

INSERT INTO products (sku, name, category, unit_of_measure, is_bsc_processed, status, sell_nassau, sell_andros, sell_online, sell_wholesale, created_by)
VALUES (
  'LS-KIT-15',
  'Half Kit Lane Snapper (15 lb)',
  (SELECT category FROM products WHERE name ILIKE '%lane snapper%' AND status = 'active' LIMIT 1),
  'kit',
  FALSE,
  'active', TRUE, FALSE, FALSE, FALSE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

INSERT INTO products (sku, name, category, unit_of_measure, is_bsc_processed, primary_supplier_id, status, sell_nassau, sell_andros, sell_online, sell_wholesale, created_by)
SELECT
  'CHK-CASE-BB',
  'Case Chicken Breast',
  'meat',
  'case',
  FALSE,
  s.id,
  'active', TRUE, FALSE, FALSE, FALSE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM suppliers s
WHERE s.name ILIKE '%bahama breeze%'
LIMIT 1;

-- Step 2: insert current cost rows

INSERT INTO product_costs (product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure, shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee, effective_from, is_current, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'LS-KIT-30'),
  NULL, 'standard', 180.00, 'kit', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

INSERT INTO product_costs (product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure, shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee, effective_from, is_current, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'LS-KIT-15'),
  NULL, 'standard', 90.00, 'kit', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

INSERT INTO product_costs (product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure, shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee, effective_from, is_current, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'CHK-CASE-BB'),
  (SELECT id FROM suppliers WHERE name ILIKE '%bahama breeze%' LIMIT 1),
  'standard', 57.93, 'case', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

-- Step 3: insert Nassau POS pricing rows (manual_override mode)

INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'LS-KIT-30'),
  'nassau_pos', 'manual_override', 1.0, 1.0, 240.00,
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'LS-KIT-15'),
  'nassau_pos', 'manual_override', 1.0, 1.0, 125.00,
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'CHK-CASE-BB'),
  'nassau_pos', 'manual_override', 1.0, 1.0, 64.90,
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

-- Verification — should return 3 rows, all with non-null cost and sell price
SELECT p.sku, p.name, p.category, pc.cost_per_unit, pp.manual_unit_price AS nassau_pos_price
FROM products p
LEFT JOIN product_costs   pc ON pc.product_id = p.id AND pc.is_current = TRUE
LEFT JOIN product_pricing pp ON pp.product_id = p.id
     AND pp.channel = 'nassau_pos' AND pp.is_current = TRUE AND pp.is_active = TRUE
WHERE p.sku IN ('LS-KIT-30', 'LS-KIT-15', 'CHK-CASE-BB');

COMMIT;
