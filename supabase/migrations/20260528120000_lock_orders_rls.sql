-- =====================================================================
-- BSC Migration: 20260528120000_lock_orders_rls.sql
--
-- SECURITY LOCKDOWN — orders table (founder direction 2026-05-28:
-- "ensure the security is as tight and secure as amazon").
--
-- THE HOLE: policy `service_role_all_orders` was created FOR ALL TO PUBLIC
-- USING (true) WITH CHECK (true). Because RLS permissive policies combine
-- with OR, that single policy overrode everything — ANY signed-in user
-- (and anon, given table grants) could READ, UPDATE, and DELETE EVERY
-- order in the system (all customer PII + tampering + deletion). The
-- per-customer/staff policies beside it were dead weight.
--
-- THE FIX (Phase 1 — closes the catastrophic read/update/delete breach):
--   * DROP the catch-all. service_role bypasses RLS anyway, so all
--     server API routes (payment/start, orders/transition, orders/create,
--     orders/cancel, driver/queue, the new GET /api/orders/[id]) keep
--     working untouched.
--   * SELECT stays "Customers read own orders" = auth.uid() = customer_id
--     OR is_staff(). Pre-checked: founder/co_founder/manager/cashier all
--     return is_staff()=true. anon → false → cannot read. Guest order
--     tracking now reads via the service-role GET /api/orders/[id].
--   * UPDATE stays "Staff update orders" = is_staff(). Non-staff lose the
--     ability to alter orders. Status changes go through the service-role
--     transition/cancel APIs.
--   * DELETE: no policy → denied for everyone except service_role.
--   * INSERT: the existing "Customers insert own orders" (WITH CHECK
--     auth.uid() = customer_id) is TOO TIGHT — it would reject POS sales
--     (cashier's uid != customer_id), guest checkout (anon), and online
--     checkout (customer_id is a customers-table record, not auth.uid).
--     Replace it with an open INSERT so every create flow keeps working.
--
-- PHASE 2 (follow-up, needs code + testing): route checkout/market/pos
-- order creation through a service-role API, then tighten INSERT to
-- is_staff()/owner. Open INSERT is create-only — no data exposure,
-- tampering, or deletion — so the catastrophic surface is closed now.
-- =====================================================================

BEGIN;

-- 1. Kill the catastrophic catch-all.
DROP POLICY IF EXISTS "service_role_all_orders" ON public.orders;

-- 2. Replace the too-tight customer-insert policy with one that preserves
--    POS / checkout / guest order creation (Phase 2 tightens this).
DROP POLICY IF EXISTS "Customers insert own orders" ON public.orders;
CREATE POLICY "orders_insert_create_flows" ON public.orders
  FOR INSERT
  WITH CHECK (true);

-- 3. (SELECT "Customers read own orders" and UPDATE "Staff update orders"
--     already exist and are correct — left untouched. No DELETE policy.)

-- 4. Self-verify: the catch-all must be gone and the scoped policies present.
DO $pf$
DECLARE
  has_catchall  boolean;
  has_select    boolean;
  has_update    boolean;
  has_insert    boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
                 WHERE c.relname='orders' AND p.polname='service_role_all_orders') INTO has_catchall;
  SELECT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
                 WHERE c.relname='orders' AND p.polname='Customers read own orders') INTO has_select;
  SELECT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
                 WHERE c.relname='orders' AND p.polname='Staff update orders') INTO has_update;
  SELECT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
                 WHERE c.relname='orders' AND p.polname='orders_insert_create_flows') INTO has_insert;

  IF has_catchall THEN RAISE EXCEPTION 'FAILED: service_role_all_orders still present'; END IF;
  IF NOT has_select THEN RAISE EXCEPTION 'FAILED: SELECT policy "Customers read own orders" missing'; END IF;
  IF NOT has_update THEN RAISE EXCEPTION 'FAILED: UPDATE policy "Staff update orders" missing'; END IF;
  IF NOT has_insert THEN RAISE EXCEPTION 'FAILED: INSERT policy missing'; END IF;

  RAISE NOTICE '✅ orders locked: catch-all dropped; SELECT=owner/staff, UPDATE=staff, DELETE=denied, INSERT=open (Phase 2 to tighten)';
END $pf$;

COMMIT;
