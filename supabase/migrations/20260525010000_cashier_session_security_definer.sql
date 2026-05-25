-- =====================================================================
-- BSC Migration: 20260525010000_cashier_session_security_definer.sql
--
-- Fix: cashier "Open Shift" was failing with
--   "Open shift failed: permission denied for table cash_drawer_sessions"
--
-- Root cause: open_cashier_session() + close_cashier_session() in
-- migration 20260519020000_cash_drawer_sessions.sql were created
-- without SECURITY DEFINER. They run as the calling cashier, who
-- lacks GRANT INSERT/UPDATE on cash_drawer_sessions → permission
-- denied at the table-level GRANT layer (RLS policies for cashier
-- self-write exist but are evaluated AFTER the GRANT check).
--
-- Fix: flip both write-functions to SECURITY DEFINER + SET search_path
-- = public. Matches the existing current_cashier_open_session_id()
-- pattern at line 59 of the original migration. The functions' own
-- internal authorization checks still apply:
--   - open_cashier_session INSERTs with cashier_user_id = auth.uid()
--     (line 160 of source migration) → cashier can ONLY open their
--     own session, not impersonate.
--   - close_cashier_session rejects when auth.uid() <> cashier_user_id
--     AND NOT (is_bsc_admin() OR is_bsc_qc_staff()) (lines 112-114) →
--     close only by owner or admin.
--
-- Per-row authorization preserved; only the table-level GRANT layer
-- is bypassed by running as the function owner (postgres superuser).
--
-- Applied to prod via Supabase SQL Editor on 2026-05-25 (Claff's
-- "Open Shift" worked on retry). This file records the change in
-- repo for migration audit trail.
--
-- Verify on apply: both functions return is_security_definer = true.
-- =====================================================================

BEGIN;

ALTER FUNCTION open_cashier_session(TEXT, INTEGER, TEXT)
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION close_cashier_session(UUID, INTEGER, TEXT)
  SECURITY DEFINER
  SET search_path = public;

COMMIT;
