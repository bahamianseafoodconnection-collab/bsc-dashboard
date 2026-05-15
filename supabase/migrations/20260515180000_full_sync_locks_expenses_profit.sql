-- BSC full-sync migration (2026-05-15).
--
-- One paste-and-run that does:
--   Section 6 — lock columns on orders, catch_logs, processing_logs
--   Section 8 — full expense reset (Dashnelle suspended, maintenance,
--               garbage) + supplier_payment → accounts_payable rename
--   Section 9 — per-transaction profit columns on orders
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DELETE-then-INSERT by exact
-- description, so it can be re-run safely.

BEGIN;

-- =====================================================================
-- Section 6 — Lock and approve columns
-- =====================================================================

ALTER TABLE orders          ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE orders          ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE catch_logs      ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE catch_logs      ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE processing_logs ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE processing_logs ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- =====================================================================
-- Section 9 — Per-transaction profit columns on orders
-- =====================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS expense_allocation DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_casale_share  DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS net_profit         DECIMAL(10, 2);

-- =====================================================================
-- Section 8 — Expense reset with corrected values
-- =====================================================================

-- Remove any prior row with one of the descriptions we're about to insert,
-- plus historical variants that used the × character instead of x.
DELETE FROM expenses
WHERE description IN (
  -- legacy "cap" rows
  'Staff Salaries — Monthly Cap',
  'Andros Staff Salaries Cap',
  'Ceta''s Store Manager Salary',
  -- previous migration (× character)
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
  'Nassau Rental — monthly',
  'Software Subscriptions — Monthly Cap',
  'Fuel Budget — Monthly Cap',
  -- new descriptions in this migration (x character + role tags)
  'Claffens — Cashier Nassau $8/hr x 40hr/wk',
  'Nicholson — Processor Nassau $8/hr x 40hr/wk',
  'Dedrick Storr Snr — Founder $10/hr x 40hr/wk',
  'TJ — Operations Nassau $8/hr x 40hr/wk',
  'Jaquel Rolle-Storr — Co-Founder $10/hr x 25hr/wk',
  'Rosonell — Andros $7/hr x 40hr/wk',
  'Cetta Bowleg — Store Manager Andros flat monthly',
  'Dashnelle — Suspended Without Pay Pending Founder Approval',
  'Maintenance & Cleaning — All Locations',
  'Garbage Collection'
);

INSERT INTO expenses (amount, category, description) VALUES
  (1386.67, 'salaries',    'Claffens — Cashier Nassau $8/hr x 40hr/wk'),
  (1386.67, 'salaries',    'Nicholson — Processor Nassau $8/hr x 40hr/wk'),
  (1733.33, 'salaries',    'Dedrick Storr Snr — Founder $10/hr x 40hr/wk'),
  (1386.67, 'salaries',    'TJ — Operations Nassau $8/hr x 40hr/wk'),
  (1083.33, 'salaries',    'Jaquel Rolle-Storr — Co-Founder $10/hr x 25hr/wk'),
  (1213.33, 'salaries',    'Rosonell — Andros $7/hr x 40hr/wk'),
  (1000.00, 'salaries',    'Cetta Bowleg — Store Manager Andros flat monthly'),
  (   0.00, 'salaries',    'Dashnelle — Suspended Without Pay Pending Founder Approval'),
  (2300.00, 'utilities',   'Nassau Electricity — monthly'),
  ( 120.00, 'utilities',   'Nassau Internet — monthly'),
  ( 400.00, 'utilities',   'Andros Electricity — monthly'),
  ( 128.00, 'utilities',   'Andros Internet — monthly'),
  (4150.00, 'rent',        'Nassau Rental — monthly'),
  ( 250.00, 'operations',  'Software Subscriptions — Monthly Cap'),
  ( 600.00, 'operations',  'Fuel Budget — Monthly Cap'),
  ( 150.00, 'maintenance', 'Maintenance & Cleaning — All Locations'),
  (  70.00, 'operations',  'Garbage Collection');

-- Category rename: supplier_payment → accounts_payable
UPDATE expenses SET category = 'accounts_payable' WHERE category = 'supplier_payment';

-- =====================================================================
-- Verification — what just happened
-- =====================================================================

-- 1. Tables present in public schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. New profit/lock columns on orders
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('locked_by','locked_at','expense_allocation','bill_casale_share','net_profit')
ORDER BY column_name;

-- 3. Lock columns on logging tables
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('catch_logs','processing_logs')
  AND column_name IN ('locked_by','locked_at')
ORDER BY table_name, column_name;

-- 4. Expense category totals after the reset
SELECT category, COUNT(*) AS rows, SUM(amount) AS monthly_total
FROM expenses
WHERE category IN ('salaries','utilities','rent','operations','maintenance')
GROUP BY category ORDER BY category;

-- 5. Full expense breakdown
SELECT amount, category, description FROM expenses
WHERE category IN ('salaries','utilities','rent','operations','maintenance')
ORDER BY category, amount DESC;

COMMIT;
