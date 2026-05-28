-- =====================================================================
-- BSC Migration: 20260528130000_block_forged_paid_orders.sql
--
-- SECURITY Phase 2 (the high-value, zero-breakage half) — founder
-- direction 2026-05-28 "secure like Amazon".
--
-- After the orders RLS lockdown (20260528120000), INSERT is still open so
-- POS / checkout / guest order creation keeps working. The one genuinely
-- dangerous thing a malicious customer/guest could do with open INSERT is
-- create an order ALREADY marked paid (payment_status='paid'/'paid_in_full')
-- without paying — goods would enter fulfillment as if paid. That's fraud.
--
-- Verified current behavior (so this breaks nothing):
--   * STAFF inserts legitimately set paid: POS Nassau (cashier),
--     /products admin quick-sale, POS Andros (andros_staff).
--   * CUSTOMER / guest inserts (checkout, market) only ever set
--     'pending' / 'payment_pending' / null — never paid. Online orders
--     become paid via the service-role payment APIs (UPDATE, not INSERT).
--
-- Fix: a BEFORE INSERT trigger that rejects an order inserted already-paid
-- UNLESS the inserter is staff (is_staff()) or a server process
-- (service_role). Customers/guests can still create pending orders; they
-- can no longer forge a paid one.
--
-- (Remaining Phase 2 — routing online order CREATION through a service-role
-- API so the INSERT policy can drop to is_staff()-only — is a separate
-- tested follow-up; it touches the checkout/RBC revenue path. This trigger
-- removes the actual fraud surface without that risk.)
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_paid_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payment_status IN ('paid', 'paid_in_full')
     AND current_user <> 'service_role'
     AND NOT public.is_staff()
  THEN
    RAISE EXCEPTION
      'Only staff or server processes may create an order already marked paid (got payment_status=%)',
      NEW.payment_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_order_paid_on_insert()
  IS 'Blocks customers/guests from inserting an order already marked paid '
     '(forged-paid fraud). Staff (is_staff()) + service_role inserts allowed. '
     'Online orders become paid via the service-role payment APIs (UPDATE).';

DROP TRIGGER IF EXISTS trg_guard_order_paid ON public.orders;
CREATE TRIGGER trg_guard_order_paid
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_paid_on_insert();

-- Self-verify
DO $pf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_order_paid') THEN
    RAISE EXCEPTION 'FAILED: trg_guard_order_paid not created';
  END IF;
  RAISE NOTICE '✅ Forged-paid order inserts blocked for non-staff clients (staff + service_role still allowed)';
END $pf$;

COMMIT;
