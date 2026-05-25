-- =====================================================================
-- D-security: close 4 SECURITY DEFINER view leaks
--
-- Pre-launch hardening flagged by Supabase Database Advisor on 2026-05-24.
-- 4 views ran with owner (postgres = superuser) privileges, bypassing
-- RLS on their underlying tables. With June 8 launch putting real
-- cashiers + suppliers + fishermen on authenticated accounts at once,
-- these became exploitable.
--
-- Fix: opt each view into security_invoker (Postgres 15+) so it evaluates
-- the CALLING user's RLS instead of the owner's. Plus revoke SELECT on
-- the spinytails trace view from authenticated — the audit RPC is
-- SECURITY DEFINER (runs as postgres) and doesn't need the GRANT.
--
-- Underlying-table RLS verified before flip (2026-05-24):
--   orders                       → is_staff() SELECT + service_role + customer-own
--   product_costs                → costs_select_admin (founder/co_founder/manager/processor) + costs_select_supplier_own
--   processing_batches           → admin SELECT (founder/co_founder/manager/supervisor/processor)
--   processing_batch_outputs     → admin SELECT (founder/co_founder/manager/supervisor/processor)
--   inventory_movements          → Build 1 p_inv_mov_select (is_bsc_staff OR owner)
--   inventory + products         → Build 1 p_* policies (is_bsc_staff OR owner)
--   cash_drawer_sessions         → p_cash_drawer_staff_all + p_cash_drawer_self_read
--   suppliers                    → staff_all + fisherman-self
--   spinytails_*                 → is_bsc_qc_staff() per loop in HACCP migration
--
-- Untouched: batch_label_public — intentionally anonymous QR-trace view,
-- the only one with anon SELECT and that's by design.
--
-- Applied to prod via Supabase SQL Editor on 2026-05-24. This file
-- records the change in repo for migration audit trail.
-- =====================================================================

BEGIN;

-- 1. cash_drawer_session_totals
--    Caller's RLS on cash_drawer_sessions now applies. Cashier sees only
--    their own session row (p_cash_drawer_self_read). Admin/qc_staff
--    sees all (p_cash_drawer_staff_all). Orders RLS applies too.
ALTER VIEW public.cash_drawer_session_totals SET (security_invoker = true);

-- 2. batch_label_admin
--    Caller's RLS on the underlying processing_batches /
--    processing_batch_outputs / products / product_costs / vessels
--    tables now applies. Suppliers no longer see other suppliers'
--    raw_cost_per_lb / cost_per_finished_lb / yield_percent.
ALTER VIEW public.batch_label_admin SET (security_invoker = true);

-- 3. current_stock
--    Caller's RLS on inventory (Build 1 owner_id predicate) now applies.
--    Vendor sees only their own owner_id rows; staff sees all.
ALTER VIEW public.current_stock SET (security_invoker = true);

-- 4. spinytails_lot_full_trace
--    Caller's RLS on the spinytails_* tables now applies (is_bsc_qc_staff
--    only). Additionally revoke the direct SELECT grant — defence in depth.
--    The audit RPC spinytails_audit_view_lot_trace() is SECURITY DEFINER
--    so it runs as postgres (superuser, bypasses RLS, no GRANT needed).
--    Verified post-flip: function body `RETURN QUERY SELECT * FROM
--    spinytails_lot_full_trace WHERE ...` continues to work.
ALTER VIEW public.spinytails_lot_full_trace SET (security_invoker = true);
REVOKE SELECT ON public.spinytails_lot_full_trace FROM authenticated;

-- 5. batch_label_public — DELIBERATELY UNTOUCHED.
--    Intentional anon GRANT for the public QR-trace scan flow.

COMMIT;
