-- =====================================================================
-- BSC Migration: 20260527130000_product_catalog_seed_v2.sql
--
-- The v2 BSC product catalog seed. Inserts 83 curated products
-- (founder-supplied via Fresh Inventory List.xlsx 2026-05-27) with:
--   - 1 row per product in `products`
--   - 1 row per product in `product_costs` (cost_type='opening_balance')
--   - 1-4 rows per product in `product_pricing` (per active channel,
--     prices = cost × (1 + channel_margin) per founder's row 4 margin
--     schedule: 0.35 nassau_pos / 0.45 andros_pos / 0.30 online_market
--     / 0.20 nassau-wholesale OR 0.14 online-wholesale → local_wholesale)
--
-- Safety harness:
--   - BEGIN/COMMIT wrapped — atomic. Any single row failure rolls back
--     the entire batch.
--   - Pre-flight: verifies all 5 required suppliers exist in DB. If any
--     missing, RAISE EXCEPTION before any INSERT.
--   - INSERT ... ON CONFLICT (sku) DO NOTHING — re-runnable. If a SKU
--     already exists, the row is skipped silently (no duplicate).
--   - Per-row CTE: each product+cost+pricing block is independent.
--   - Post-flight: counts seeded vs expected, raises NOTICE summary.
--   - Audit row written to ai_writes at end.
--
-- DOES NOT TOUCH existing 318 products. They stay live until the
-- founder runs the separate archive migration.
--
-- Channel mapping (XLSX → DB enum):
--   Nassau POS retail    → nassau_pos       (35%)
--   Nassau POS special   → SKIP (discount via products.special_price)
--   Nassau POS wholesale → local_wholesale  (20%, priority 1)
--   Andros POS           → andros_pos       (45%)
--   Online retail        → online_market    (30%)
--   Online Wholesale     → local_wholesale  (14%, priority 2)
--   Farmers Bulk         → SKIP (no enum match yet)
--   Fishermen bulk       → SKIP (no enum match yet)
-- =====================================================================

BEGIN;

-- ─── Pre-flight: verify suppliers exist ───────────────────────────────
DO $pf$
DECLARE
  missing text[];
  required text[] := ARRAY[
    'Tropic Seafood', 'Bahama Breeze', 'Spiny tail processing',
    'Sysco Bahamas', 'Bahamas Wholesale Agencies'
  ];
BEGIN
  SELECT array_agg(r) INTO missing
  FROM unnest(required) AS r
  WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE name ILIKE r);
  IF array_length(missing, 1) IS NOT NULL AND array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Pre-flight FAILED: missing suppliers in DB: %',
                    array_to_string(missing, ', ');
  END IF;
  RAISE NOTICE 'Pre-flight OK: all 5 required suppliers found.';
END $pf$;

-- ─── Row 5: Salmon (6oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SALMON-6OZ-PORTION',
    'Salmon',
    'IVP Norwegion',
    'frozen_seafood'::product_category,
    'each',
    '6oz',
    'uncooked_food',
    '/images/products/salmon-portion.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_5 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         4.3030, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_5 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 5.8100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 6.2400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 5.5900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 6: Salmon (6oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SALMON-6OZ-CASE',
    'Salmon',
    'IVP 26pcs Norwegion',
    'frozen_seafood'::product_category,
    'case',
    '6oz',
    'uncooked_food',
    '/images/products/salmon-portion.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_6 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         111.9000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_6 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 162.2600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 134.2800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 7: Salmon (8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SALMON-8OZ-CASE',
    'Salmon',
    'IVP 20pcs Norwegion',
    'frozen_seafood'::product_category,
    'case',
    '8oz',
    'uncooked_food',
    '/images/products/salmon-portion.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_7 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         111.9000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_7 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 162.2600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 134.2800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 8: Salmon (8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SALMON-8OZ-PORTION',
    'Salmon',
    'IVP Norwegion',
    'frozen_seafood'::product_category,
    'each',
    '8oz',
    'uncooked_food',
    '/images/products/salmon-portion.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_8 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         5.6000, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_8 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 7.5600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.1200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 7.2800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 9: Mahi Mahi (6oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-MAHI-MAHI-6OZ-PORTION',
    'Mahi Mahi',
    'IVP',
    'frozen_seafood'::product_category,
    'each',
    '6oz',
    'uncooked_food',
    '/images/products/mahi-mahi.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_9 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         5.7500, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_9 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 7.7600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.3400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 7.4800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 10: Mahi Mahi (6oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-MAHI-MAHI-6OZ-CASE',
    'Mahi Mahi',
    'IVP 26pcs',
    'frozen_seafood'::product_category,
    'case',
    '6oz',
    'uncooked_food',
    '/images/products/mahi-mahi.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_10 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         149.5000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_10 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 216.7800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 179.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 11: Snapper Fillet (6/8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SNAPPER-FILLET-68OZ-PORTION',
    'Snapper Fillet',
    'IVP',
    'frozen_seafood'::product_category,
    'each',
    '6/8oz',
    'uncooked_food',
    '/images/products/snapper-fillet.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_11 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         5.0500, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_11 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 6.8200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 7.3200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 6.5700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 12: Snapper Fillet (6/8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SNAPPER-FILLET-68OZ-CASE',
    'Snapper Fillet',
    'IVP 23pcs',
    'frozen_seafood'::product_category,
    'case',
    '6/8oz',
    'uncooked_food',
    '/images/products/snapper-fillet.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_12 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         116.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_12 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 168.2000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 139.2000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 13: Snapper Finger (1-2oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SNAPPER-FINGER-12OZ-BAG',
    'Snapper Finger',
    '2lb bag',
    'frozen_seafood'::product_category,
    'bag',
    '1-2oz',
    'uncooked_food',
    '/images/products/snapper-fingers.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_13 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         17.3000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_13 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 23.3600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 25.0900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 22.4900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 14: Snapper Finger (1-2oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SNAPPER-FINGER-12OZ-CASE',
    'Snapper Finger',
    '5 X 2lb bag',
    'frozen_seafood'::product_category,
    'case',
    '1-2oz',
    'uncooked_food',
    '/images/products/snapper-fingers.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_14 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         86.5000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_14 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 125.4300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 103.8000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 15: Grouper Fillet (6/8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-GROUPER-FILLET-68OZ-PORTION',
    'Grouper Fillet',
    'IVP',
    'frozen_seafood'::product_category,
    'each',
    '6/8oz',
    'uncooked_food',
    '/images/products/grouper-fillet.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_15 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.4500, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_15 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.7100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 9.3500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 8.3900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 16: Grouper Fillet (6/8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-GROUPER-FILLET-68OZ-CASE',
    'Grouper Fillet',
    'IVP 23pcs',
    'frozen_seafood'::product_category,
    'case',
    '6/8oz',
    'uncooked_food',
    '/images/products/grouper-fillet.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_16 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         147.5000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_16 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 213.8800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 177.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 17: Shrimp (16/20) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SHRIMP-1620-BAG',
    'Shrimp',
    '2lb bag',
    'frozen_seafood'::product_category,
    'bag',
    '16/20',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_17 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         13.9800, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_17 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 18.8700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 20.2700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 18.1700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 18: Shrimp (16/20) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SHRIMP-1620-CASE',
    'Shrimp',
    '5 x 2lb bag',
    'frozen_seafood'::product_category,
    'case',
    '16/20',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_18 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         69.9000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_18 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 101.3600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 83.8800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 19: Immitation Crab Meat (1 lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-IMMITATION-CRAB-MEAT-1LB-PACK',
    'Immitation Crab Meat',
    'IVP',
    'frozen_seafood'::product_category,
    'pack',
    '1 lb',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_19 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         4.2000, 'pack',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_19 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 5.6700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 6.0900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 5.4600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 20: Immitation Crab Meat (1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-IMMITATION-CRAB-MEAT-1LB-CASE',
    'Immitation Crab Meat',
    'IVP 20 X 1lb',
    'frozen_seafood'::product_category,
    'case',
    '1lb',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_20 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         83.8000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_20 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 121.5100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 100.5600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 21: Unbreaded Calamari Rings (10lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-UNBREADED-CALAMARI-RINGS-10LB-BAG',
    'Unbreaded Calamari Rings',
    '10lb bag',
    'frozen_seafood'::product_category,
    'bag',
    '10lb',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_21 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         59.5000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_21 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 80.3300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 86.2800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 77.3500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 22: Unbreaded Calamari Rings (1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-UNBREADED-CALAMARI-RINGS-1LB-BAG',
    'Unbreaded Calamari Rings',
    '1lb',
    'frozen_seafood'::product_category,
    'bag',
    '1lb',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_22 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         5.9500, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_22 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.0300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.6300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 7.7400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 23: #1 Lobster Meat (1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-1-LOBSTER-MEAT-1LB-BAG',
    '#1 Lobster Meat',
    '1lb',
    'frozen_seafood'::product_category,
    'bag',
    '1lb',
    'uncooked_food',
    '/images/products/lobster-meat-1.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_23 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         13.0000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_23 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 17.5500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 18.8500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 16.9000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 24: #1 Lobster Meat (10lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-1-LOBSTER-MEAT-10LB-CASE',
    '#1 Lobster Meat',
    'IVP 10pcs',
    'frozen_seafood'::product_category,
    'case',
    '10lb',
    'uncooked_food',
    '/images/products/lobster-meat-1.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_24 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         125.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_24 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 181.2500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 150.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 25: #2 Lobster Meat (1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-2-LOBSTER-MEAT-1LB-BAG',
    '#2 Lobster Meat',
    'IVP',
    'frozen_seafood'::product_category,
    'bag',
    '1lb',
    'uncooked_food',
    '/images/products/lobster-tail-2.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_25 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.5000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_25 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.7800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 9.4300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 8.4500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 26: #2 Lobster Meat (10lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-2-LOBSTER-MEAT-10LB-CASE',
    '#2 Lobster Meat',
    'IVP 10pcs',
    'frozen_seafood'::product_category,
    'case',
    '10lb',
    'uncooked_food',
    '/images/products/lobster-tail-2.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_26 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         55.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_26 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 74.2500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 79.7500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 71.5000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 27: Whole Nassau Grouper  · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-WHOLE-NASSAU-GROUPER-PERPOUND',
    'Whole Nassau Grouper',
    'Gutted with skin',
    'frozen_seafood'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/nassau-grouper-whole.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_27 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         5.5000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_27 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 7.9800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 6.6000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 28: Whole Nassau Grouper  · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-WHOLE-NASSAU-GROUPER-PERPOUND',
    'Whole Nassau Grouper',
    'Gutted, no skin',
    'frozen_seafood'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/nassau-grouper-whole.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_28 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.2500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_28 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 9.0600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 7.5000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 29: Snow Crab (1.5lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SNOW-CRAB-15LB-BOX',
    'Snow Crab',
    NULL,
    'frozen_seafood'::product_category,
    'box',
    '1.5lb',
    'uncooked_food',
    '/images/products/snow-crab-cluster.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_29 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         26.9500, 'box',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_29 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 39.0800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 32.3400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 30: Snow Crab (6lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SNOW-CRAB-6LB-CASE',
    'Snow Crab',
    '4 x 1.5lb',
    'frozen_seafood'::product_category,
    'case',
    '6lb',
    'uncooked_food',
    '/images/products/snow-crab-cluster.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_30 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         107.7000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_30 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 156.1700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 129.2400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 31: Black mussel (1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-BLACK-MUSSEL-1LB-PACK',
    'Black mussel',
    '1lb bag',
    'frozen_seafood'::product_category,
    'pack',
    '1lb',
    'uncooked_food',
    '/images/products/black-mussels.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_31 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         3.0500, 'pack',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_31 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 4.1200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 4.4200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 3.9700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 32: Black Mussel (10lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-BLACK-MUSSEL-10LB-CASE',
    'Black Mussel',
    '10x 1lb',
    'frozen_seafood'::product_category,
    'case',
    '10lb',
    'uncooked_food',
    '/images/products/black-mussels.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_32 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         30.5000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_32 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 44.2300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 36.6000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 33: Lane Snapper 33lb (3/4-1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-LANE-SNAPPER-33LB-341LB-KIT',
    'Lane Snapper 33lb',
    'bulk gutted w/scales',
    'frozen_seafood'::product_category,
    'each',
    '3/4-1lb',
    'uncooked_food',
    '/images/products/lane-snapper.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_33 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         206.2500, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_33 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 299.0600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 247.5000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 34: Lane Snapper (3/4-1lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-LANE-SNAPPER-341LB-CASE',
    'Lane Snapper',
    'IVP 15-18 pcs',
    'frozen_seafood'::product_category,
    'case',
    '3/4-1lb',
    'uncooked_food',
    '/images/products/lane-snapper.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_34 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         66.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_34 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 95.7000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 79.2000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 35: Green lip Mussel (half shell) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-GREEN-LIP-MUSSEL-HALFSHELL-BOX',
    'Green lip Mussel',
    '2lb Box',
    'frozen_seafood'::product_category,
    'box',
    'half shell',
    'uncooked_food',
    '/images/products/green-lip-mussels.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_35 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         13.1800, 'box',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_35 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 17.7900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 19.1100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 17.1300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 36: Green lip Mussel (half shell) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-GREEN-LIP-MUSSEL-HALFSHELL-CASE',
    'Green lip Mussel',
    '12 x 2lb',
    'frozen_seafood'::product_category,
    'case',
    'half shell',
    'uncooked_food',
    '/images/products/green-lip-mussels.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_36 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         158.1600, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_36 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 229.3300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 189.7900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 37: Tuna Steak (6oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-TUNA-STEAK-6OZ-PORTION',
    'Tuna Steak',
    'IVP',
    'frozen_seafood'::product_category,
    'each',
    '6oz',
    'uncooked_food',
    '/images/products/tuna-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_37 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         4.0380, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_37 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 5.4500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 5.8600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 5.2500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 38: Tuna Steak (6oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-TUNA-STEAK-6OZ-CASE',
    'Tuna Steak',
    'IVP 26pcs',
    'frozen_seafood'::product_category,
    'case',
    '6oz',
    'uncooked_food',
    '/images/products/tuna-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_38 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         105.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_38 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 152.2500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 126.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 39: Rack Of Lamb  · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-RACK-OF-LAMB-EACH',
    'Rack Of Lamb',
    'double rack',
    'frozen_meat'::product_category,
    'each',
    NULL,
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_39 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         39.9000, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_39 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 57.8600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 47.8800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 40: Rack Of Lamb  · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-RACK-OF-LAMB-CASE',
    'Rack Of Lamb',
    '10 racks',
    'frozen_meat'::product_category,
    'case',
    NULL,
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_40 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         399.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_40 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 578.5500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 478.8000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 41: Ribeye E/C CAB (9/11oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-RIBEYE-E-C-CAB-911OZ-PORTION',
    'Ribeye E/C CAB',
    'IVP',
    'frozen_meat'::product_category,
    'each',
    '9/11oz',
    'uncooked_food',
    '/images/products/cowboy-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_41 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         9.6000, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_41 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 13.9200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 11.5200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 42: Ribeye E/C CAB (9/11oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-RIBEYE-E-C-CAB-911OZ-PERPOUND',
    'Ribeye E/C CAB',
    'IVP',
    'frozen_meat'::product_category,
    'lb',
    '9/11oz',
    'uncooked_food',
    '/images/products/cowboy-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_42 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         13.9500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_42 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 20.2300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 16.7400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 43: T-Bone (16oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-T-BONE-16OZ-PORTION',
    'T-Bone',
    'IVP',
    'frozen_meat'::product_category,
    'each',
    '16oz',
    'uncooked_food',
    '/images/products/t-bone-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_43 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         9.9700, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_43 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 14.4600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 11.9600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 44: T-Bone (16oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-T-BONE-16OZ-PERPOUND',
    'T-Bone',
    'IVP',
    'frozen_meat'::product_category,
    'lb',
    '16oz',
    'uncooked_food',
    '/images/products/t-bone-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_44 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         14.5000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_44 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 21.0300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 17.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 45: Tenderloin tip steak (5-6lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-TENDERLOIN-TIP-STEAK-56LB-PORTION',
    'Tenderloin tip steak',
    'IVP',
    'frozen_meat'::product_category,
    'each',
    '5-6lb',
    'uncooked_food',
    '/images/products/tenderloin-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_45 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         55.5000, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_45 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 80.4800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 66.6000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 46: Tenderloin steak (5-6lb) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-TENDERLOIN-STEAK-56LB-PERPOUND',
    'Tenderloin steak',
    '2 x 5-6lb',
    'frozen_meat'::product_category,
    'lb',
    '5-6lb',
    'uncooked_food',
    '/images/products/tenderloin-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_46 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         9.2500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_46 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 13.4100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 11.1000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 47: Tenderloin steak (4oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-TENDERLOIN-STEAK-4OZ-PORTION',
    'Tenderloin steak',
    'IVP',
    'frozen_meat'::product_category,
    'each',
    '4oz',
    'uncooked_food',
    '/images/products/tenderloin-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    false, false, false, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 48: Tenderloin steak (4oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-TENDERLOIN-STEAK-4OZ-PERPOUND',
    'Tenderloin steak',
    'IVP',
    'frozen_meat'::product_category,
    'lb',
    '4oz',
    'uncooked_food',
    '/images/products/tenderloin-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    false, false, false, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 49: Shrimp (26/30) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SHRIMP-2630-BAG',
    'Shrimp',
    '2lb',
    'frozen_seafood'::product_category,
    'bag',
    '26/30',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_49 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         12.0000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_49 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 16.2000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 17.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 15.6000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 50: Shrimp (26/30) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SHRIMP-2630-CASE',
    'Shrimp',
    '5 x 2lb bag',
    'frozen_seafood'::product_category,
    'case',
    '26/30',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_50 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         60.0000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_50 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 87.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 72.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 51: Swai Fillet (7/9oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-SWAI-FILLET-79OZ-PERPOUND',
    'Swai Fillet',
    NULL,
    'frozen_seafood'::product_category,
    'lb',
    '7/9oz',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_51 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         2.6500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_51 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 3.8400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 3.1800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 52: New York Strip Steak (8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-NEW-YORK-STRIP-STEAK-8OZ-PORTION',
    'New York Strip Steak',
    'IVP',
    'frozen_meat'::product_category,
    'each',
    '8oz',
    'uncooked_food',
    '/images/products/new-york-strip-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_52 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.7500, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_52 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 9.7900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 8.1000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 53: New York Strip Steak (8oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-NEW-YORK-STRIP-STEAK-8OZ-PERPOUND',
    'New York Strip Steak',
    'IVP',
    'frozen_meat'::product_category,
    'lb',
    '8oz',
    'uncooked_food',
    '/images/products/new-york-strip-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_53 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         12.0000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_53 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 17.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 14.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 54: PorterHouse steak (20oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-PORTERHOUSE-STEAK-20OZ-PORTION',
    'PorterHouse steak',
    'IVP',
    'frozen_meat'::product_category,
    'each',
    '20oz',
    'uncooked_food',
    '/images/products/porterhouse-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_54 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         21.5600, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_54 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 31.2600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 25.8700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 55: PorterHouse steak (20oz) · tropic seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-PORTERHOUSE-STEAK-20OZ-PERPOUND',
    'PorterHouse steak',
    'IVP',
    'frozen_meat'::product_category,
    'lb',
    '20oz',
    'uncooked_food',
    '/images/products/porterhouse-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_55 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         17.2500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_55 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 25.0100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 20.7000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 57: Chicken Breast (4.4lb) · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-BREAST-44LB-PACK',
    'Chicken Breast',
    NULL,
    'frozen_meat'::product_category,
    'pack',
    '4.4lb',
    'uncooked_food',
    '/images/products/chicken-breast.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_57 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         9.9000, 'pack',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_57 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 14.3600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 11.8800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 58: Crack Chicken (1.5lb) · spiny Tails Processing ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-CRACK-CHICKEN-15LB-BAG',
    'Crack Chicken',
    NULL,
    'frozen_meat'::product_category,
    'bag',
    '1.5lb',
    'uncooked_food',
    '/images/products/crack-chicken.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_58 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         3.4500, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_58 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 4.6600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 5.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 4.4900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 59: Chicken Breast (26.46lb) · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-BREAST-2646LB-CASE',
    'Chicken Breast',
    'bulk',
    'frozen_meat'::product_category,
    'case',
    '26.46lb',
    'uncooked_food',
    '/images/products/chicken-breast.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_59 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         59.5500, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_59 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 86.3500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 71.4600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 60: Chicken Leg Quarters (33lb) · Bahamas Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-LEG-QUARTERS-33LB-CASE',
    'Chicken Leg Quarters',
    'bulk',
    'frozen_meat'::product_category,
    'case',
    '33lb',
    'uncooked_food',
    '/images/products/chicken-leg-quarters.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_60 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         33.9900, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_60 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 49.2900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 40.7900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 61: Chicken Leg Quarters  · bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-LEG-QUARTERS-PERPOUND',
    'Chicken Leg Quarters',
    'retail',
    'frozen_meat'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/chicken-leg-quarters.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_61 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         1.0500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_61 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 1.5200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 1.2600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 62: Spareribs  · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-SPARERIBS-PERPOUND',
    'Spareribs',
    'retail',
    'frozen_meat'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/pork-spare-ribs.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_62 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         2.2500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_62 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 3.2600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 2.7000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 63: Spareribs (39.6lbs) · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-SPARERIBS-396LBS-CASE',
    'Spareribs',
    'bulk',
    'frozen_meat'::product_category,
    'case',
    '39.6lbs',
    'uncooked_food',
    '/images/products/pork-spare-ribs.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_63 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         89.1000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_63 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 129.2000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 106.9200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 64: Chicken Wings (33lb) · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-WINGS-33LB-CASE',
    'Chicken Wings',
    'bulk',
    'frozen_meat'::product_category,
    'case',
    '33lb',
    'uncooked_food',
    '/images/products/chicken-wings.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_64 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         46.8600, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_64 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 67.9500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 56.2300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 65: Chicken Wings  · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-WINGS-PERPOUND',
    'Chicken Wings',
    'retail',
    'frozen_meat'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/chicken-wings.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_65 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         1.4200, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_65 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 2.0600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 1.7000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 66: Chicken Griller (3.4lb) · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-GRILLER-34LB-EACH',
    'Chicken Griller',
    'retail',
    'frozen_meat'::product_category,
    'each',
    '3.4lb',
    'uncooked_food',
    '/images/products/chicken-griller.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_66 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         5.7500, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_66 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.3400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 6.9000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 67: Chicken Griller (26.4lb) · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-CHICKEN-GRILLER-264LB-CASE',
    'Chicken Griller',
    'bulk',
    'frozen_meat'::product_category,
    'case',
    '26.4lb',
    'uncooked_food',
    '/images/products/chicken-griller.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_67 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         44.8800, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_67 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 65.0800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 53.8600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 68: Pig Feet  · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-PIG-FEET-PERPOUND',
    'Pig Feet',
    NULL,
    'frozen_meat'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_68 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         1.3500, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_68 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 1.9600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 1.6200, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 69: Pork Chop Ends  · Bahama Breeze ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BB-PORK-CHOP-ENDS-PERPOUND',
    'Pork Chop Ends',
    NULL,
    'frozen_meat'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahama Breeze' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_69 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         2.2000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_69 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 3.1900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 2.6400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 71: Conch Kit (30lb) · Spiny Tail ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-CONCH-KIT-30LB-KIT',
    'Conch Kit',
    'bulk',
    'frozen_seafood'::product_category,
    'each',
    '30lb',
    'uncooked_food',
    '/images/products/conch-kit.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    true,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_71 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         165.0000, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_71 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 239.2500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 198.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 72: Can Gas Butane  · Sysco ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-CAN-GAS-BUTANE-CASE',
    'Can Gas Butane',
    '28x 8oz',
    'grocery'::product_category,
    'case',
    NULL,
    'cooked_prepared',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_72 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         32.6000, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_72 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 47.2700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 37.1600, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 73: Tenderized Conch (12oz) · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-TENDERIZED-CONCH-12OZ-BAG',
    'Tenderized Conch',
    'retail vacuum',
    'frozen_seafood'::product_category,
    'bag',
    '12oz',
    'uncooked_food',
    '/images/products/tenderized-conch-pack.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    true,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_73 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         4.5000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_73 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 6.5300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 5.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 74: Tenderized Conch (24oz) · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-TENDERIZED-CONCH-24OZ-BAG',
    'Tenderized Conch',
    'retail vacuum',
    'frozen_seafood'::product_category,
    'bag',
    '24oz',
    'uncooked_food',
    '/images/products/tenderized-conch-pack.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    true,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_74 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         9.0000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_74 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 13.0500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 10.8000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 75: Tenderized Conch (5lb) · Spiny Tail ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-TENDERIZED-CONCH-5LB-BAG',
    'Tenderized Conch',
    'vacuumed pack',
    'frozen_seafood'::product_category,
    'bag',
    '5lb',
    'uncooked_food',
    '/images/products/tenderized-conch-pack.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    true,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_75 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         30.0000, 'bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_75 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 43.5000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 36.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 76: Tenderized Conch (10lb) · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-TENDERIZED-CONCH-10LB-BAG',
    'Tenderized Conch',
    'vacuumed pack',
    'frozen_seafood'::product_category,
    'Bag',
    '10lb',
    'uncooked_food',
    '/images/products/tenderized-conch-pack.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    true,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_76 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         60.0000, 'Bag',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_76 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 87.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 72.0000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 77: Fresh lane Snappers  · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-FRESH-LANE-SNAPPERS-PERPOUND',
    'Fresh lane Snappers',
    'frozen at Sea',
    'frozen_seafood'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/lane-snapper.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_77 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.0000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_77 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.1000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 8.7000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 7.8000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 78: Grouper Steak  · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-GROUPER-STEAK-PERPOUND',
    'Grouper Steak',
    'frozen at sea',
    'frozen_seafood'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/grouper-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_78 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         8.5000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_78 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 11.4800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 12.3300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 11.0500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 79: Mutton Snapper Steak  · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-MUTTON-SNAPPER-STEAK-PERPOUND',
    'Mutton Snapper Steak',
    'frozen at Sea',
    'frozen_seafood'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    '/images/products/mutton-snapper-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_79 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         7.5000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_79 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 10.1300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 10.8800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 9.7500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 80: Salmon Slab (2-3lb) · SPINY TAIL ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SPT-SALMON-SLAB-23LB-PERPOUND',
    'Salmon Slab',
    'Fillet',
    'frozen_seafood'::product_category,
    'lb',
    '2-3lb',
    'uncooked_food',
    '/images/products/salmon-slab.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Spiny tail processing' LIMIT 1),
    false,
    'active'::product_status,
    true, true, true, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_80 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         7.7000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_80 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'nassau_pos'::pricing_channel, 'manual_override'::pricing_mode, 10.4000, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 11.1700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'online_market'::pricing_channel, 'manual_override'::pricing_mode, 10.0100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 81: ShoeString Fries (1/4 inch) · SYSCO ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-SHOESTRING-FRIES-14INCH-CASE',
    'ShoeString Fries',
    '6 x 4.5lb',
    'grocery'::product_category,
    'case',
    '1/4 inch',
    'uncooked_food',
    '/images/products/shoestring-fries.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_81 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         41.8500, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_81 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 60.6800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 47.7100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 82: Ground beef (1lb) · SYSCO ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-GROUND-BEEF-1LB-CASE',
    'Ground beef',
    '24 x 1lb',
    'frozen_meat'::product_category,
    'case',
    '1lb',
    'uncooked_food',
    '/images/products/ground-beef.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_82 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         131.4800, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_82 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 190.6500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 149.8900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 83: Ground Turkey (1lb) · SYSCO ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-GROUND-TURKEY-1LB-CASE',
    'Ground Turkey',
    '12 x 1lb',
    'frozen_meat'::product_category,
    'case',
    '1lb',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_83 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         57.5900, 'case',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_83 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 83.5100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 65.6500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 84: Whole Duck  · SYSCO ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-WHOLE-DUCK-PERPOUND',
    'Whole Duck',
    '6 x 6.75lb',
    'frozen_meat'::product_category,
    'lb',
    NULL,
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_84 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.5010, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_84 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 9.4300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 7.4100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 85: Sugar  · SYSCO ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-SUGAR',
    'Sugar',
    '8 x 4lb',
    'grocery'::product_category,
    'each',
    NULL,
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_85 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         21.1300, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_85 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 30.6400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 24.0900, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 86: Badia  Garlic (16oz) · SYSCO ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'SYSCO-BADIA-GARLIC-16OZ-EACH',
    'Badia  Garlic',
    '16oz',
    'grocery'::product_category,
    'Each',
    '16oz',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Sysco Bahamas' LIMIT 1),
    false,
    'active'::product_status,
    false, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_86 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         6.8500, 'Each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_86 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 9.9300, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 7.8100, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 87: OK Flour (5lb) · BWA ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'BWA-OK-FLOUR-5LB-CASE',
    'OK Flour',
    '10 x 5lb',
    'grocery'::product_category,
    'case',
    '5lb',
    'uncooked_food',
    NULL,
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Bahamas Wholesale Agencies' LIMIT 1),
    false,
    'active'::product_status,
    false, false, false, false,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 88: Cowboy (18-20oz) · Tropic Seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-COWBOY-1820OZ-PORTION',
    'Cowboy',
    '18-20oz',
    'frozen_meat'::product_category,
    'each',
    '18-20oz',
    'uncooked_food',
    '/images/products/cowboy-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_88 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         22.1250, 'each',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_88 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 32.0800, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 26.5500, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Row 89: Cowboy (18-20oz) · Tropic Seafood ───
WITH new_p AS (
  INSERT INTO products (
    sku, name, description, category, unit_of_measure, pack_size,
    vat_category, image_url, primary_supplier_id, is_bsc_processed,
    status, sell_nassau, sell_andros, sell_online, sell_wholesale,
    created_by, created_at
  ) VALUES (
    'TROPIC-COWBOY-1820OZ-PERPOUND',
    'Cowboy',
    '18-20oz',
    'frozen_meat'::product_category,
    'lb',
    '18-20oz',
    'uncooked_food',
    '/images/products/cowboy-steak.jpg',
    (SELECT id FROM public.suppliers WHERE name ILIKE 'Tropic Seafood' LIMIT 1),
    false,
    'active'::product_status,
    true, true, false, true,
    NULL::uuid, now()
  )
  ON CONFLICT (sku) DO NOTHING
  RETURNING id, primary_supplier_id, sku
),
ins_cost_89 AS (
  INSERT INTO product_costs (
    product_id, supplier_id, cost_type, cost_per_unit, unit_of_measure,
    shipping_per_lb, customs_duty_pct, vat_levy_pct, processing_fee,
    effective_from, is_current, recorded_by
  )
  SELECT id, primary_supplier_id, 'opening_balance'::cost_type,
         17.7000, 'lb',
         0, 0, 0, 0, now(), true, NULL::uuid
  FROM new_p
  RETURNING product_id
),
ins_pricing_89 AS (
  INSERT INTO product_pricing (
    product_id, channel, pricing_mode, manual_unit_price,
    margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
    vat_levy_pct, per_transaction_fee, service_fee_pct,
    effective_from, is_current, is_active, recorded_by
  )
  SELECT id, 'andros_pos'::pricing_channel, 'manual_override'::pricing_mode, 25.6700, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
      UNION ALL SELECT id, 'local_wholesale'::pricing_channel, 'manual_override'::pricing_mode, 21.2400, 1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL::uuid FROM new_p
  RETURNING product_id
)
SELECT COUNT(*) AS seeded FROM new_p;

-- ─── Post-flight: verify counts + audit ──────────────────────────────
DO $pf$
DECLARE
  expected_count int := 83;
  actual_count int;
  missing_skus text[];
BEGIN
  SELECT COUNT(*) INTO actual_count
  FROM public.products
  WHERE sku = ANY(ARRAY['TROPIC-SALMON-6OZ-PORTION','TROPIC-SALMON-6OZ-CASE','TROPIC-SALMON-8OZ-CASE','TROPIC-SALMON-8OZ-PORTION','TROPIC-MAHI-MAHI-6OZ-PORTION','TROPIC-MAHI-MAHI-6OZ-CASE','TROPIC-SNAPPER-FILLET-68OZ-PORTION','TROPIC-SNAPPER-FILLET-68OZ-CASE','TROPIC-SNAPPER-FINGER-12OZ-BAG','TROPIC-SNAPPER-FINGER-12OZ-CASE','TROPIC-GROUPER-FILLET-68OZ-PORTION','TROPIC-GROUPER-FILLET-68OZ-CASE','TROPIC-SHRIMP-1620-BAG','TROPIC-SHRIMP-1620-CASE','TROPIC-IMMITATION-CRAB-MEAT-1LB-PACK','TROPIC-IMMITATION-CRAB-MEAT-1LB-CASE','TROPIC-UNBREADED-CALAMARI-RINGS-10LB-BAG','TROPIC-UNBREADED-CALAMARI-RINGS-1LB-BAG','TROPIC-1-LOBSTER-MEAT-1LB-BAG','TROPIC-1-LOBSTER-MEAT-10LB-CASE','TROPIC-2-LOBSTER-MEAT-1LB-BAG','TROPIC-2-LOBSTER-MEAT-10LB-CASE','TROPIC-WHOLE-NASSAU-GROUPER-PERPOUND','TROPIC-WHOLE-NASSAU-GROUPER-PERPOUND','TROPIC-SNOW-CRAB-15LB-BOX','TROPIC-SNOW-CRAB-6LB-CASE','TROPIC-BLACK-MUSSEL-1LB-PACK','TROPIC-BLACK-MUSSEL-10LB-CASE','TROPIC-LANE-SNAPPER-33LB-341LB-KIT','TROPIC-LANE-SNAPPER-341LB-CASE','TROPIC-GREEN-LIP-MUSSEL-HALFSHELL-BOX','TROPIC-GREEN-LIP-MUSSEL-HALFSHELL-CASE','TROPIC-TUNA-STEAK-6OZ-PORTION','TROPIC-TUNA-STEAK-6OZ-CASE','TROPIC-RACK-OF-LAMB-EACH','TROPIC-RACK-OF-LAMB-CASE','TROPIC-RIBEYE-E-C-CAB-911OZ-PORTION','TROPIC-RIBEYE-E-C-CAB-911OZ-PERPOUND','TROPIC-T-BONE-16OZ-PORTION','TROPIC-T-BONE-16OZ-PERPOUND','TROPIC-TENDERLOIN-TIP-STEAK-56LB-PORTION','TROPIC-TENDERLOIN-STEAK-56LB-PERPOUND','TROPIC-TENDERLOIN-STEAK-4OZ-PORTION','TROPIC-TENDERLOIN-STEAK-4OZ-PERPOUND','TROPIC-SHRIMP-2630-BAG','TROPIC-SHRIMP-2630-CASE','TROPIC-SWAI-FILLET-79OZ-PERPOUND','TROPIC-NEW-YORK-STRIP-STEAK-8OZ-PORTION','TROPIC-NEW-YORK-STRIP-STEAK-8OZ-PERPOUND','TROPIC-PORTERHOUSE-STEAK-20OZ-PORTION','TROPIC-PORTERHOUSE-STEAK-20OZ-PERPOUND','BB-CHICKEN-BREAST-44LB-PACK','SPT-CRACK-CHICKEN-15LB-BAG','BB-CHICKEN-BREAST-2646LB-CASE','BB-CHICKEN-LEG-QUARTERS-33LB-CASE','BB-CHICKEN-LEG-QUARTERS-PERPOUND','BB-SPARERIBS-PERPOUND','BB-SPARERIBS-396LBS-CASE','BB-CHICKEN-WINGS-33LB-CASE','BB-CHICKEN-WINGS-PERPOUND','BB-CHICKEN-GRILLER-34LB-EACH','BB-CHICKEN-GRILLER-264LB-CASE','BB-PIG-FEET-PERPOUND','BB-PORK-CHOP-ENDS-PERPOUND','SPT-CONCH-KIT-30LB-KIT','SYSCO-CAN-GAS-BUTANE-CASE','SPT-TENDERIZED-CONCH-12OZ-BAG','SPT-TENDERIZED-CONCH-24OZ-BAG','SPT-TENDERIZED-CONCH-5LB-BAG','SPT-TENDERIZED-CONCH-10LB-BAG','SPT-FRESH-LANE-SNAPPERS-PERPOUND','SPT-GROUPER-STEAK-PERPOUND','SPT-MUTTON-SNAPPER-STEAK-PERPOUND','SPT-SALMON-SLAB-23LB-PERPOUND','SYSCO-SHOESTRING-FRIES-14INCH-CASE','SYSCO-GROUND-BEEF-1LB-CASE','SYSCO-GROUND-TURKEY-1LB-CASE','SYSCO-WHOLE-DUCK-PERPOUND','SYSCO-SUGAR','SYSCO-BADIA-GARLIC-16OZ-EACH','BWA-OK-FLOUR-5LB-CASE','TROPIC-COWBOY-1820OZ-PORTION','TROPIC-COWBOY-1820OZ-PERPOUND']);

  SELECT array_agg(s) INTO missing_skus
  FROM unnest(ARRAY['TROPIC-SALMON-6OZ-PORTION','TROPIC-SALMON-6OZ-CASE','TROPIC-SALMON-8OZ-CASE','TROPIC-SALMON-8OZ-PORTION','TROPIC-MAHI-MAHI-6OZ-PORTION','TROPIC-MAHI-MAHI-6OZ-CASE','TROPIC-SNAPPER-FILLET-68OZ-PORTION','TROPIC-SNAPPER-FILLET-68OZ-CASE','TROPIC-SNAPPER-FINGER-12OZ-BAG','TROPIC-SNAPPER-FINGER-12OZ-CASE','TROPIC-GROUPER-FILLET-68OZ-PORTION','TROPIC-GROUPER-FILLET-68OZ-CASE','TROPIC-SHRIMP-1620-BAG','TROPIC-SHRIMP-1620-CASE','TROPIC-IMMITATION-CRAB-MEAT-1LB-PACK','TROPIC-IMMITATION-CRAB-MEAT-1LB-CASE','TROPIC-UNBREADED-CALAMARI-RINGS-10LB-BAG','TROPIC-UNBREADED-CALAMARI-RINGS-1LB-BAG','TROPIC-1-LOBSTER-MEAT-1LB-BAG','TROPIC-1-LOBSTER-MEAT-10LB-CASE','TROPIC-2-LOBSTER-MEAT-1LB-BAG','TROPIC-2-LOBSTER-MEAT-10LB-CASE','TROPIC-WHOLE-NASSAU-GROUPER-PERPOUND','TROPIC-WHOLE-NASSAU-GROUPER-PERPOUND','TROPIC-SNOW-CRAB-15LB-BOX','TROPIC-SNOW-CRAB-6LB-CASE','TROPIC-BLACK-MUSSEL-1LB-PACK','TROPIC-BLACK-MUSSEL-10LB-CASE','TROPIC-LANE-SNAPPER-33LB-341LB-KIT','TROPIC-LANE-SNAPPER-341LB-CASE','TROPIC-GREEN-LIP-MUSSEL-HALFSHELL-BOX','TROPIC-GREEN-LIP-MUSSEL-HALFSHELL-CASE','TROPIC-TUNA-STEAK-6OZ-PORTION','TROPIC-TUNA-STEAK-6OZ-CASE','TROPIC-RACK-OF-LAMB-EACH','TROPIC-RACK-OF-LAMB-CASE','TROPIC-RIBEYE-E-C-CAB-911OZ-PORTION','TROPIC-RIBEYE-E-C-CAB-911OZ-PERPOUND','TROPIC-T-BONE-16OZ-PORTION','TROPIC-T-BONE-16OZ-PERPOUND','TROPIC-TENDERLOIN-TIP-STEAK-56LB-PORTION','TROPIC-TENDERLOIN-STEAK-56LB-PERPOUND','TROPIC-TENDERLOIN-STEAK-4OZ-PORTION','TROPIC-TENDERLOIN-STEAK-4OZ-PERPOUND','TROPIC-SHRIMP-2630-BAG','TROPIC-SHRIMP-2630-CASE','TROPIC-SWAI-FILLET-79OZ-PERPOUND','TROPIC-NEW-YORK-STRIP-STEAK-8OZ-PORTION','TROPIC-NEW-YORK-STRIP-STEAK-8OZ-PERPOUND','TROPIC-PORTERHOUSE-STEAK-20OZ-PORTION','TROPIC-PORTERHOUSE-STEAK-20OZ-PERPOUND','BB-CHICKEN-BREAST-44LB-PACK','SPT-CRACK-CHICKEN-15LB-BAG','BB-CHICKEN-BREAST-2646LB-CASE','BB-CHICKEN-LEG-QUARTERS-33LB-CASE','BB-CHICKEN-LEG-QUARTERS-PERPOUND','BB-SPARERIBS-PERPOUND','BB-SPARERIBS-396LBS-CASE','BB-CHICKEN-WINGS-33LB-CASE','BB-CHICKEN-WINGS-PERPOUND','BB-CHICKEN-GRILLER-34LB-EACH','BB-CHICKEN-GRILLER-264LB-CASE','BB-PIG-FEET-PERPOUND','BB-PORK-CHOP-ENDS-PERPOUND','SPT-CONCH-KIT-30LB-KIT','SYSCO-CAN-GAS-BUTANE-CASE','SPT-TENDERIZED-CONCH-12OZ-BAG','SPT-TENDERIZED-CONCH-24OZ-BAG','SPT-TENDERIZED-CONCH-5LB-BAG','SPT-TENDERIZED-CONCH-10LB-BAG','SPT-FRESH-LANE-SNAPPERS-PERPOUND','SPT-GROUPER-STEAK-PERPOUND','SPT-MUTTON-SNAPPER-STEAK-PERPOUND','SPT-SALMON-SLAB-23LB-PERPOUND','SYSCO-SHOESTRING-FRIES-14INCH-CASE','SYSCO-GROUND-BEEF-1LB-CASE','SYSCO-GROUND-TURKEY-1LB-CASE','SYSCO-WHOLE-DUCK-PERPOUND','SYSCO-SUGAR','SYSCO-BADIA-GARLIC-16OZ-EACH','BWA-OK-FLOUR-5LB-CASE','TROPIC-COWBOY-1820OZ-PORTION','TROPIC-COWBOY-1820OZ-PERPOUND']::text[]) AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE sku = s);

  RAISE NOTICE '──────────────────────────────────────';
  RAISE NOTICE 'PRODUCT CATALOG SEED v2 — RESULTS';
  RAISE NOTICE '  expected: %', expected_count;
  RAISE NOTICE '  in DB:    % (NEW or PRE-EXISTING — ON CONFLICT skipped dupes)', actual_count;
  IF missing_skus IS NOT NULL AND array_length(missing_skus, 1) > 0 THEN
    RAISE NOTICE '  MISSING (% rows did NOT land):', array_length(missing_skus, 1);
    RAISE NOTICE '    %', array_to_string(missing_skus, ', ');
  ELSE
    RAISE NOTICE '  All % SKUs accounted for ✓', actual_count;
  END IF;
  RAISE NOTICE '──────────────────────────────────────';

  -- Audit row
  INSERT INTO public.ai_writes (tool, caller_id, input, result, status, error)
  VALUES (
    'product_catalog_seed_v2',
    NULL,
    jsonb_build_object('source', 'Fresh Inventory List.xlsx',
                       'row_count', expected_count,
                       'migration', '20260527130000_product_catalog_seed_v2.sql'),
    jsonb_build_object('expected', expected_count,
                       'in_db', actual_count,
                       'missing_count', COALESCE(array_length(missing_skus, 1), 0)),
    CASE WHEN actual_count = expected_count THEN 'success' ELSE 'partial' END,
    CASE WHEN actual_count < expected_count
         THEN format('%s SKUs missing', COALESCE(array_length(missing_skus, 1), 0))
         ELSE NULL END
  );
END $pf$;

COMMIT;
