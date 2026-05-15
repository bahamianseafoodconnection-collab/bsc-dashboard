-- Replaces the three "salary cap" placeholder rows with per-person
-- detail, locks in the current month's utility costs for Nassau and
-- Andros, and records the Nassau monthly rent.
--
-- Monthly = hourly_rate × hours_per_week × 52 / 12  (4.333 weeks/mo)
--
-- Idempotent: deletes any prior row with one of the descriptions we
-- are about to insert, so this migration can be re-run safely.

BEGIN;

-- 1. Remove rows we are replacing.
DELETE FROM expenses
WHERE description IN (
  'Staff Salaries — Monthly Cap',
  'Andros Staff Salaries Cap',
  'Ceta''s Store Manager Salary',
  'Claffens — Cashier (Nassau) — $8/hr × 40 hr/wk',
  'Nicholson — Processor (Nassau) — $8/hr × 40 hr/wk',
  'Dedrick Storr Snr — $10/hr × 40 hr/wk (Nassau)',
  'TJ — Operations (Nassau) — $8/hr × 40 hr/wk',
  'Jaquel Rolle-Storr — $10/hr × 25 hr/wk (Nassau)',
  'Rosonell — $7/hr × 40 hr/wk (Andros)',
  'Cetta Bowleg — Store Manager (Andros) — flat monthly',
  'Nassau Electricity — monthly',
  'Nassau Internet — monthly',
  'Andros Electricity — monthly',
  'Andros Internet — monthly',
  'Nassau Rental — monthly'
);

-- 2. Nassau staff (hourly × weekly hours × 52 / 12 = monthly)
INSERT INTO expenses (amount, category, description) VALUES
  (1386.67, 'salaries', 'Claffens — Cashier (Nassau) — $8/hr × 40 hr/wk'),
  (1386.67, 'salaries', 'Nicholson — Processor (Nassau) — $8/hr × 40 hr/wk'),
  (1733.33, 'salaries', 'Dedrick Storr Snr — $10/hr × 40 hr/wk (Nassau)'),
  (1386.67, 'salaries', 'TJ — Operations (Nassau) — $8/hr × 40 hr/wk'),
  (1083.33, 'salaries', 'Jaquel Rolle-Storr — $10/hr × 25 hr/wk (Nassau)');

-- 3. Andros staff
INSERT INTO expenses (amount, category, description) VALUES
  (1213.33, 'salaries', 'Rosonell — $7/hr × 40 hr/wk (Andros)'),
  (1000.00, 'salaries', 'Cetta Bowleg — Store Manager (Andros) — flat monthly');

-- 4. Utilities
INSERT INTO expenses (amount, category, description) VALUES
  (2400.00, 'utilities', 'Nassau Electricity — monthly'),
  ( 120.00, 'utilities', 'Nassau Internet — monthly'),
  ( 300.00, 'utilities', 'Andros Electricity — monthly'),
  ( 120.00, 'utilities', 'Andros Internet — monthly');

-- 5. Rent
INSERT INTO expenses (amount, category, description) VALUES
  (4150.00, 'rent', 'Nassau Rental — monthly');

-- 6. Verification — see the new totals grouped by category.
SELECT category, COUNT(*) AS rows, SUM(amount) AS monthly_total
FROM expenses
WHERE category IN ('salaries', 'utilities', 'rent')
GROUP BY category
ORDER BY category;

SELECT amount, category, description
FROM expenses
WHERE category IN ('salaries', 'utilities', 'rent')
ORDER BY category, amount DESC;

COMMIT;
