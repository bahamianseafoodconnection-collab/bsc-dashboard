-- Adds three Nassau-POS-only products:
--   1. 30lb Lane Snapper Kit   (LS-KIT-30)   — cost/sell derived from existing per-lb Lane Snapper row × 30
--   2. Half Kit Lane Snapper   (LS-KIT-15)   — cost/sell derived from existing per-lb Lane Snapper row × 15
--   3. Case Chicken Breast     (CHK-CASE-BB) — supplier Bahama Breeze, cost $57.93, sell $64.90
--
-- Assumptions (verify before running):
--   • Source Lane Snapper row = name ILIKE '%lane snapper%' AND unit_type='lb' AND status='active'.
--     If multiple exist, the most-recent (by created_at) is used.
--   • Half kit = 15 lb.
--   • Supplier "Bahama Breeze" is matched by name (case-insensitive).
--   • All three rows are flagged Nassau POS only (sell_nassau=true, others false).
--   • created_by/recorded_by = founder UUID (Dedrick).
--
-- Optional preview — run this SELECT first to confirm the source row before the BEGIN:
--   SELECT p.sku, p.name, p.category, pc.cost_per_unit, pp.manual_unit_price
--   FROM products p
--   LEFT JOIN product_costs   pc ON pc.product_id = p.id AND pc.is_current = TRUE
--   LEFT JOIN product_pricing pp ON pp.product_id = p.id
--        AND pp.channel = 'nassau_pos' AND pp.is_current = TRUE AND pp.is_active = TRUE
--   WHERE p.name ILIKE '%lane snapper%' AND p.unit_type = 'lb' AND p.status = 'active'
--   ORDER BY p.created_at DESC;

BEGIN;

-- Step 1: insert the three product rows

INSERT INTO products (sku, name, category, unit_of_measure, is_bsc_processed, status, sell_nassau, sell_andros, sell_online, sell_wholesale, created_by)
SELECT
  'LS-KIT-30',
  '30lb Lane Snapper Kit',
  p.category,
  'kit',
  p.is_bsc_processed,
  'active', TRUE, FALSE, FALSE, FALSE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM products p
WHERE p.name ILIKE '%lane snapper%'
  AND p.unit_type = 'lb'
  AND p.status = 'active'
ORDER BY p.created_at DESC
LIMIT 1;

INSERT INTO products (sku, name, category, unit_of_measure, is_bsc_processed, status, sell_nassau, sell_andros, sell_online, sell_wholesale, created_by)
SELECT
  'LS-KIT-15',
  'Half Kit Lane Snapper (15 lb)',
  p.category,
  'kit',
  p.is_bsc_processed,
  'active', TRUE, FALSE, FALSE, FALSE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM products p
WHERE p.name ILIKE '%lane snapper%'
  AND p.unit_type = 'lb'
  AND p.status = 'active'
ORDER BY p.created_at DESC
LIMIT 1;

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
SELECT
  (SELECT id FROM products WHERE sku = 'LS-KIT-30'),
  NULL,
  'standard',
  (SELECT pc.cost_per_unit * 30
   FROM products p
   JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
   WHERE p.name ILIKE '%lane snapper%' AND p.unit_type = 'lb' AND p.status = 'active'
   ORDER BY p.created_at DESC LIMIT 1),
  'kit', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid;

INSERT INTO product_costs (product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure, shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee, effective_from, is_current, recorded_by)
SELECT
  (SELECT id FROM products WHERE sku = 'LS-KIT-15'),
  NULL,
  'standard',
  (SELECT pc.cost_per_unit * 15
   FROM products p
   JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
   WHERE p.name ILIKE '%lane snapper%' AND p.unit_type = 'lb' AND p.status = 'active'
   ORDER BY p.created_at DESC LIMIT 1),
  'kit', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid;

INSERT INTO product_costs (product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure, shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee, effective_from, is_current, recorded_by)
SELECT
  (SELECT id FROM products WHERE sku = 'CHK-CASE-BB'),
  (SELECT id FROM suppliers WHERE name ILIKE '%bahama breeze%' LIMIT 1),
  'standard',
  57.93,
  'case', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid;

-- Step 3: insert Nassau POS pricing rows (manual_override mode)

INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
SELECT
  (SELECT id FROM products WHERE sku = 'LS-KIT-30'),
  'nassau_pos', 'manual_override', 1.0, 1.0,
  (SELECT pp.manual_unit_price * 30
   FROM products p
   JOIN product_pricing pp ON pp.product_id = p.id
     AND pp.channel = 'nassau_pos' AND pp.is_current = TRUE AND pp.is_active = TRUE
   WHERE p.name ILIKE '%lane snapper%' AND p.unit_type = 'lb' AND p.status = 'active'
   ORDER BY p.created_at DESC LIMIT 1),
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid;

INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
SELECT
  (SELECT id FROM products WHERE sku = 'LS-KIT-15'),
  'nassau_pos', 'manual_override', 1.0, 1.0,
  (SELECT pp.manual_unit_price * 15
   FROM products p
   JOIN product_pricing pp ON pp.product_id = p.id
     AND pp.channel = 'nassau_pos' AND pp.is_current = TRUE AND pp.is_active = TRUE
   WHERE p.name ILIKE '%lane snapper%' AND p.unit_type = 'lb' AND p.status = 'active'
   ORDER BY p.created_at DESC LIMIT 1),
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid;

INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
SELECT
  (SELECT id FROM products WHERE sku = 'CHK-CASE-BB'),
  'nassau_pos', 'manual_override', 1.0, 1.0,
  64.90,
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid;

-- Verification — should return 3 rows, all with non-null cost and sell price
SELECT p.sku, p.name, p.category, pc.cost_per_unit, pp.manual_unit_price AS nassau_pos_price
FROM products p
LEFT JOIN product_costs   pc ON pc.product_id = p.id AND pc.is_current = TRUE
LEFT JOIN product_pricing pp ON pp.product_id = p.id
     AND pp.channel = 'nassau_pos' AND pp.is_current = TRUE AND pp.is_active = TRUE
WHERE p.sku IN ('LS-KIT-30', 'LS-KIT-15', 'CHK-CASE-BB');

COMMIT;
