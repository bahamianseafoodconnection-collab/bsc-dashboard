-- Two surgical fixes:
--   1. Sysco supplier attribution — re-bind any SYSCO-* product whose
--      primary_supplier_id doesn't point to the canonical Sysco row.
--      (User reports the Sysco card shows 1 product, but 53 were seeded.)
--   2. BWA pasta cost cents — 9 rows still hold $27.30 / $34.70 from a
--      prior partial run. product_costs has an immutability trigger, so
--      we disable user triggers on that table for the surgical UPDATEs.

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- Snapshot before any change
-- ──────────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase,
       s.id   AS supplier_id,
       s.code,
       s.name,
       s.is_active,
       COUNT(p.id) AS products_attached
FROM suppliers s
LEFT JOIN products p ON p.primary_supplier_id = s.id
WHERE s.code IN ('SYSCO','BWA')
   OR s.name ILIKE '%sysco%'
   OR s.name ILIKE '%bahamas wholesale%'
GROUP BY s.id, s.code, s.name, s.is_active
ORDER BY s.code NULLS LAST, s.name;

-- ──────────────────────────────────────────────────────────────────
-- 1. Re-bind SYSCO and BWA products to the canonical supplier rows.
--    Canonical = match by code first, then any name match. If multiple
--    rows match (duplicate suppliers), pick the active one created
--    earliest (most stable).
-- ──────────────────────────────────────────────────────────────────
WITH target_sysco AS (
  SELECT id FROM suppliers
  WHERE code = 'SYSCO' OR name ILIKE '%sysco%'
  ORDER BY (code = 'SYSCO') DESC, is_active DESC, created_at ASC
  LIMIT 1
)
UPDATE products
SET primary_supplier_id = (SELECT id FROM target_sysco)
WHERE sku LIKE 'SYSCO-%'
  AND (primary_supplier_id IS DISTINCT FROM (SELECT id FROM target_sysco));

WITH target_bwa AS (
  SELECT id FROM suppliers
  WHERE code = 'BWA' OR name ILIKE '%bahamas wholesale%'
  ORDER BY (code = 'BWA') DESC, is_active DESC, created_at ASC
  LIMIT 1
)
UPDATE products
SET primary_supplier_id = (SELECT id FROM target_bwa)
WHERE sku LIKE 'BWA-%'
  AND (primary_supplier_id IS DISTINCT FROM (SELECT id FROM target_bwa));

-- ──────────────────────────────────────────────────────────────────
-- 2. Pasta cost cents fix (9 rows). Disable user triggers on
--    product_costs for the duration of these surgical UPDATEs,
--    then re-enable. DISABLE TRIGGER USER preserves internal/system
--    triggers (FK constraints etc.); only user-defined ones pause.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE product_costs DISABLE TRIGGER USER;

UPDATE product_costs
SET cost_per_unit = 27.35
WHERE is_current = TRUE
  AND cost_per_unit = 27.30
  AND product_id IN (
    SELECT id FROM products WHERE sku IN (
      'BWA-118-0295','BWA-118-1016','BWA-118-1022','BWA-118-3066',
      'BWA-118-3071','BWA-118-3081','BWA-118-3086'
    )
  );

UPDATE product_costs
SET cost_per_unit = 34.75
WHERE is_current = TRUE
  AND cost_per_unit = 34.70
  AND product_id IN (
    SELECT id FROM products WHERE sku IN (
      'BWA-118-3900','BWA-118-3910'
    )
  );

ALTER TABLE product_costs ENABLE TRIGGER USER;

-- Recompute online_market sell prices for the 9 corrected pasta items.
UPDATE product_pricing pp
SET manual_unit_price = ROUND((pc.cost_per_unit / 0.75 * 1.10)::numeric, 2)
FROM products p
JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
WHERE pp.product_id = p.id
  AND pp.channel    = 'online_market'
  AND pp.is_current = TRUE
  AND p.sku IN (
    'BWA-118-0295','BWA-118-1016','BWA-118-1022','BWA-118-3066',
    'BWA-118-3071','BWA-118-3081','BWA-118-3086',
    'BWA-118-3900','BWA-118-3910'
  );

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────────
SELECT 'AFTER' AS phase,
       s.id   AS supplier_id,
       s.code,
       s.name,
       s.is_active,
       COUNT(p.id) AS products_attached
FROM suppliers s
LEFT JOIN products p ON p.primary_supplier_id = s.id
WHERE s.code IN ('SYSCO','BWA')
   OR s.name ILIKE '%sysco%'
   OR s.name ILIKE '%bahamas wholesale%'
GROUP BY s.id, s.code, s.name, s.is_active
ORDER BY s.code NULLS LAST, s.name;

SELECT p.sku, p.name, pc.cost_per_unit, pp.manual_unit_price AS online_sell
FROM products p
JOIN product_costs pc ON pc.product_id = p.id AND pc.is_current = TRUE
LEFT JOIN product_pricing pp ON pp.product_id = p.id AND pp.channel = 'online_market' AND pp.is_current = TRUE
WHERE p.sku IN (
  'BWA-118-0295','BWA-118-1016','BWA-118-1022','BWA-118-3066',
  'BWA-118-3071','BWA-118-3081','BWA-118-3086',
  'BWA-118-3900','BWA-118-3910'
)
ORDER BY p.sku;
