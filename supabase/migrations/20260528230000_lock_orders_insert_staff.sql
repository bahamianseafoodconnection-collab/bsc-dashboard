-- =====================================================================
-- BSC Migration: 20260528230000_lock_orders_insert_staff.sql
--
-- Phase 2 of the orders security lockdown: close direct client INSERT.
-- All online order creation now goes through the service-role endpoint
-- /api/orders/place (checkout + market), and POS/admin sales insert
-- client-side as staff. So restrict the open INSERT policy to staff only;
-- service_role bypasses RLS, so the API path is unaffected.
--
-- IMPORTANT: is_staff() does NOT include control_admin / basic_admin /
-- andros_staff, all of which can ring sales (products quick-sale,
-- Andros POS). So this policy enumerates the FULL set of order-creating
-- staff roles directly — do not collapse it to is_staff().
--
-- ⚠️ APPLY ONLY AFTER confirming the deploy is live (market routing) AND
-- after re-testing POS / Andros POS / admin quick-sale order creation.
-- If any staff sale fails with a row-level-security error after this,
-- a role is missing from the list below — add it.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "orders_insert_create_flows" ON public.orders;

CREATE POLICY "orders_insert_staff_only" ON public.orders
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, false) = true
        AND u.role::text IN (
          'founder','co_founder','manager','supervisor','control_admin',
          'basic_admin','cashier','right_hand','strategist','andros_staff',
          'processor','partner_us','receiver'
        )
    )
  );

DO $pf$
BEGIN
  RAISE NOTICE '✅ orders INSERT locked to staff. Online creation flows through service-role /api/orders/place; non-staff client inserts denied.';
END $pf$;

COMMIT;
