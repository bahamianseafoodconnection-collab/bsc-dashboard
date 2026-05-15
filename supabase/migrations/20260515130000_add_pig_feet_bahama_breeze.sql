-- Adds a single product available on Nassau POS AND Online Market:
--   Pig Feet (PIG-FEET-BB) — Bahama Breeze supplier, cost $1.05/lb, sell $1.49/lb on both channels
--
-- Strategy: list before purchase to match $1.49 market price and protect margin.
-- Bahama Breeze must already exist in suppliers (it does — added in the prior migration).
-- unit_type='lb' so the POS shows the weight input modal at checkout.

BEGIN;

-- Insert product (links to existing Bahama Breeze supplier)
INSERT INTO products (sku, name, category, unit_of_measure, unit_type, is_bsc_processed, primary_supplier_id, status, sell_nassau, sell_andros, sell_online, sell_wholesale, created_by)
SELECT
  'PIG-FEET-BB',
  'Pig Feet',
  'meat',
  'lb',
  'lb',
  FALSE,
  s.id,
  'active', TRUE, FALSE, TRUE, FALSE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
FROM suppliers s
WHERE s.name ILIKE '%bahama breeze%'
LIMIT 1;

-- Cost row
INSERT INTO product_costs (product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure, shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee, effective_from, is_current, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'PIG-FEET-BB'),
  (SELECT id FROM suppliers WHERE name ILIKE '%bahama breeze%' LIMIT 1),
  'opening_balance', 1.05, 'lb', 0, 0, 0, 0, NOW(), TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

-- Nassau POS pricing row (manual override at $1.49/lb)
INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'PIG-FEET-BB'),
  'nassau_pos', 'manual_override', 1.0, 1.0, 1.49,
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

-- Online Market pricing row (manual override at $1.49/lb — same as POS to keep parity)
INSERT INTO product_pricing (product_id, channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
VALUES (
  (SELECT id FROM products WHERE sku = 'PIG-FEET-BB'),
  'online_market', 'manual_override', 1.0, 1.0, 1.49,
  0, 0, 0, 0, 0, NOW(), TRUE, TRUE,
  '7b62672c-9259-4c1b-98d4-3b78369a52ab'::uuid
);

-- Verify — should return two rows: one for nassau_pos and one for online_market, both at $1.49
SELECT p.sku, p.name, p.category, p.unit_type, p.sell_nassau, p.sell_online,
       pc.cost_per_unit, pp.channel, pp.manual_unit_price AS sell_price
FROM products p
LEFT JOIN product_costs   pc ON pc.product_id = p.id AND pc.is_current = TRUE
LEFT JOIN product_pricing pp ON pp.product_id = p.id
     AND pp.is_current = TRUE AND pp.is_active = TRUE
WHERE p.sku = 'PIG-FEET-BB'
ORDER BY pp.channel;

COMMIT;
