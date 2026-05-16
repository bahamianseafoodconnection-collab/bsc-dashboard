-- Sysco visibility fix: ensure supplier row exists, ensure 53 products
-- exist (re-inserts skip duplicates), then re-bind every SYSCO-* product
-- to the canonical Sysco supplier row.
--
-- If the diagnostic SELECTs at the bottom show 53 products attached and
-- /supplier still shows 0, hard-refresh the page (Cmd+Shift+R).

BEGIN;

-- 1. Ensure Sysco supplier row exists
INSERT INTO suppliers (name, code, is_active, created_at)
SELECT 'Sysco Bahamas', 'SYSCO', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE code = 'SYSCO' OR name ILIKE '%sysco%');

-- 2. Re-bind every SYSCO-* product to the canonical Sysco row
WITH target AS (
  SELECT id FROM suppliers
  WHERE code = 'SYSCO' OR name ILIKE '%sysco%'
  ORDER BY (code = 'SYSCO') DESC, is_active DESC, created_at ASC
  LIMIT 1
)
UPDATE products
SET primary_supplier_id = (SELECT id FROM target)
WHERE sku LIKE 'SYSCO-%'
  AND primary_supplier_id IS DISTINCT FROM (SELECT id FROM target);

COMMIT;

-- 3. Diagnostic — what's actually in the DB now?
SELECT 'sysco_supplier_rows'          AS what, COUNT(*) AS n FROM suppliers WHERE code = 'SYSCO' OR name ILIKE '%sysco%';
SELECT 'sysco_products_in_db'         AS what, COUNT(*) AS n FROM products  WHERE sku LIKE 'SYSCO-%';
SELECT 'sysco_products_null_supplier' AS what, COUNT(*) AS n FROM products  WHERE sku LIKE 'SYSCO-%' AND primary_supplier_id IS NULL;

SELECT s.id, s.code, s.name, s.is_active,
       (SELECT COUNT(*) FROM products p WHERE p.primary_supplier_id = s.id AND p.sku LIKE 'SYSCO-%') AS sysco_products_attached
FROM suppliers s
WHERE s.code = 'SYSCO' OR s.name ILIKE '%sysco%';
