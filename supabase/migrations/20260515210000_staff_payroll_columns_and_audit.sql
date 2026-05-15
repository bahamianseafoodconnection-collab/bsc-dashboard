-- Staff payroll columns + change-log audit table.
--
-- Adds hourly_rate, hours_per_week, monthly_salary, and expense_id to
-- the staff table so the staff-admin page can capture pay info and
-- auto-link each staff member to their salaries-category expense row.
--
-- monthly_salary is the rounded value of hourly × hours/wk × 52 / 12.
-- The application computes and writes it; this column is the persisted
-- snapshot so reports can SUM(monthly_salary) without recomputing.
--
-- staff_changes is the audit log: every create / update / deactivate /
-- reactivate writes a row with changed_by + changed_at + details JSON.
-- Idempotent — re-running this migration is safe.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate    numeric(8, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hours_per_week numeric(5, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_salary numeric(10, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS expense_id     uuid REFERENCES expenses(id) ON DELETE SET NULL;

ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS hourly_rate    numeric(8, 2);
ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS hours_per_week numeric(5, 2);
ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS monthly_salary numeric(10, 2);
ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS expense_id     uuid REFERENCES expenses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS staff_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  action      text NOT NULL,         -- 'create' | 'update' | 'deactivate' | 'reactivate'
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT NOW(),
  details     jsonb
);

CREATE INDEX IF NOT EXISTS idx_staff_changes_user_id    ON staff_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_changes_changed_at ON staff_changes(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_changes_action     ON staff_changes(action);

-- Sanity check
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('hourly_rate','hours_per_week','monthly_salary','expense_id')
ORDER BY column_name;

SELECT 'staff_changes table exists' AS status FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'staff_changes';

COMMIT;
