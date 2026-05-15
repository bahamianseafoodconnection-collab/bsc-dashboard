-- Generic duplicate sweep on expenses. Removes any row whose
-- description appears more than once, keeping the earliest one
-- (oldest created_at; tie-break by id).
--
-- The first SELECT block shows which rows are about to disappear,
-- so paste the whole thing and read the output before committing.
-- (If you'd rather inspect first then commit manually, run the
-- preview SELECT outside this BEGIN/COMMIT block.)

BEGIN;

-- 1. PREVIEW — duplicate descriptions in expenses
SELECT description,
       COUNT(*)                       AS dup_count,
       ARRAY_AGG(id ORDER BY created_at) AS ids,
       ARRAY_AGG(amount   ORDER BY created_at) AS amounts,
       ARRAY_AGG(category ORDER BY created_at) AS categories,
       ARRAY_AGG(created_at ORDER BY created_at) AS createds
FROM expenses
GROUP BY description
HAVING COUNT(*) > 1
ORDER BY description;

-- 2. PREVIEW — exact rows that the DELETE below will remove
SELECT id, amount, category, description, created_at
FROM (
  SELECT id, amount, category, description, created_at,
         ROW_NUMBER() OVER (PARTITION BY description ORDER BY created_at ASC, id ASC) AS rn
  FROM expenses
) t
WHERE rn > 1
ORDER BY description, created_at;

-- 3. DELETE all but the earliest row per description.
DELETE FROM expenses
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY description ORDER BY created_at ASC, id ASC) AS rn
    FROM expenses
  ) t
  WHERE rn > 1
);

-- 4. CONFIRM — should return zero rows
SELECT description, COUNT(*) AS still_dup
FROM expenses
GROUP BY description
HAVING COUNT(*) > 1;

-- 5. Updated fixed-overhead totals by category
SELECT category, COUNT(*) AS rows, SUM(amount) AS monthly_total
FROM expenses
WHERE category IN ('salaries','utilities','rent','operations','maintenance')
GROUP BY category ORDER BY category;

COMMIT;
