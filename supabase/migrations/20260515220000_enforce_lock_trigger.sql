-- Database-level enforcement of the lock invariant on orders, catch_logs,
-- and processing_logs.
--
-- Goal: a "locked" row (locked_by IS NOT NULL) cannot be UPDATED or DELETED
-- by anyone except a founder or co_founder. This is defense-in-depth above
-- the app-side LockButton check; even a hand-crafted Supabase client call
-- can't tamper with locked records.
--
-- Implementation choice: a BEFORE UPDATE OR DELETE trigger rather than RLS.
-- RLS is the "Supabase-native" approach but enabling RLS on tables that
-- don't already have full SELECT/INSERT policy coverage immediately breaks
-- every existing read path (dashboard, POS catalog, reports). A trigger
-- enforces the lock without changing any other access semantics, and runs
-- regardless of whether RLS is on or off for the table. The equivalent
-- RLS policy set is included at the bottom of this file (commented out)
-- for when you're ready to take the RLS route.
--
-- Trigger semantics:
--   - Service role / background context (auth.uid() IS NULL): allowed.
--     Service role is for migrations + admin scripts; bypassing the lock
--     is expected behavior at that level.
--   - Authenticated user updating an UNLOCKED row: allowed.
--   - Authenticated user updating a LOCKED row:
--       - If profiles.role IN ('founder','co_founder'): allowed
--         (so they can unlock or edit).
--       - Otherwise: RAISE EXCEPTION (errcode 42501 = insufficient privilege).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_lock() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id   uuid := auth.uid();
  caller_role text;
BEGIN
  -- Service role / no auth context bypasses lock enforcement.
  IF caller_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Only enforce when the row WAS locked. Lock + unlock + ordinary updates
  -- to unlocked rows all flow through with no extra cost.
  IF OLD.locked_by IS NOT NULL THEN
    SELECT role INTO caller_role FROM profiles WHERE id = caller_id;
    IF caller_role IS NULL OR caller_role NOT IN ('founder', 'co_founder') THEN
      RAISE EXCEPTION 'This record is locked. A founder or co-founder must unlock it before edits.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_lock_trigger ON orders;
CREATE TRIGGER enforce_lock_trigger
  BEFORE UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_lock();

DROP TRIGGER IF EXISTS enforce_lock_trigger ON catch_logs;
CREATE TRIGGER enforce_lock_trigger
  BEFORE UPDATE OR DELETE ON catch_logs
  FOR EACH ROW EXECUTE FUNCTION enforce_lock();

DROP TRIGGER IF EXISTS enforce_lock_trigger ON processing_logs;
CREATE TRIGGER enforce_lock_trigger
  BEFORE UPDATE OR DELETE ON processing_logs
  FOR EACH ROW EXECUTE FUNCTION enforce_lock();

-- Verification — should list 3 triggers, one per table, each "BEFORE
-- UPDATE" and "BEFORE DELETE" depending on event_manipulation.
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name = 'enforce_lock_trigger'
ORDER BY event_object_table, event_manipulation;

COMMIT;

-- =====================================================================
-- OPTIONAL: equivalent RLS policy set (commented out).
--
-- Run these ONLY after you've verified that the rest of your read/insert
-- access patterns are covered by their own RLS policies. Otherwise the
-- dashboard, POS catalog, reports, etc. will start returning empty result
-- sets the moment you flip ENABLE ROW LEVEL SECURITY on these tables.
--
-- Once RLS is enabled, you can DROP the trigger above; the policy below
-- enforces the same invariant.
--
-- ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE catch_logs      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "no_update_when_locked" ON orders;
-- CREATE POLICY "no_update_when_locked" ON orders
--   FOR UPDATE USING (
--     locked_by IS NULL
--     OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('founder','co_founder'))
--   );
--
-- DROP POLICY IF EXISTS "no_delete_when_locked" ON orders;
-- CREATE POLICY "no_delete_when_locked" ON orders
--   FOR DELETE USING (
--     locked_by IS NULL
--     OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('founder','co_founder'))
--   );
--
-- (Repeat the two policies above for catch_logs and processing_logs.)
-- =====================================================================
