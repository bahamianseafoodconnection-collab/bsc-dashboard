-- =====================================================================
-- BSC Migration: 20260525020000_grant_select_cash_drawer_sessions.sql
--
-- Fix: cashier loadCashierSession returning null after page reload →
-- /pos badge showed 🔴 No shift even when shift was open in DB →
-- Phase 2a guard blocked the next sale.
--
-- Root cause: cash_drawer_sessions was created with RLS policies but
-- without GRANT SELECT TO authenticated. The earlier same-day fix
-- (20260525010000_cashier_session_security_definer.sql) made the
-- write-RPCs SECURITY DEFINER so open/close work. The direct SELECT
-- from /pos client (loadCashierSession) still runs as the cashier,
-- hits the missing GRANT, silently returns null.
--
-- Fix: GRANT SELECT to authenticated. RLS still scopes per row via:
--   - p_cash_drawer_self_read  (cashier_user_id = auth.uid())
--   - p_cash_drawer_staff_all  (is_bsc_admin() OR is_bsc_qc_staff())
--
-- Intentionally NOT granting INSERT/UPDATE — RPCs handle writes via
-- SECURITY DEFINER. Defense in depth keeps the table-level GRANT
-- surface minimal.
--
-- Applied to prod via Supabase SQL Editor on 2026-05-25 (Claff
-- reload + retry confirmed working). This file records the change
-- in repo for migration audit trail.
--
-- Side finding from the verify query: authenticated also has
-- REFERENCES + TRIGGER + TRUNCATE on this table (pre-existing,
-- unrelated to this migration). Flagged as a separate post-launch
-- security audit — TRUNCATE in particular is dangerous because RLS
-- does NOT apply to TRUNCATE statements. Likely affects multiple
-- tables; needs a project-wide sweep.
-- =====================================================================

BEGIN;

GRANT SELECT ON cash_drawer_sessions TO authenticated;

COMMIT;
