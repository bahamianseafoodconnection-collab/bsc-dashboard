-- =====================================================================
-- BSC Migration: 20260528200000_ar_view_security_invoker.sql
--
-- Lock down the ar_unpaid_orders view. As created it runs with the view
-- OWNER's privileges and is granted to `authenticated`, so it bypasses the
-- orders RLS lockdown — any logged-in user could read EVERY customer's
-- unpaid balance (names, phones, totals). Setting security_invoker = true
-- makes the view honor the querying user's RLS on orders:
--   * staff (is_staff()) → see all unpaid account orders (the AR dashboard)
--   * a customer → only their own (harmless)
--   * service_role (alert/reminder jobs) → all (bypasses RLS as designed)
-- =====================================================================

BEGIN;

ALTER VIEW public.ar_unpaid_orders SET (security_invoker = true);

DO $pf$
DECLARE inv boolean;
BEGIN
  SELECT (reloptions::text ILIKE '%security_invoker=true%')
    INTO inv
  FROM pg_class WHERE relname = 'ar_unpaid_orders' AND relkind = 'v';
  IF NOT COALESCE(inv, false) THEN
    RAISE EXCEPTION 'security_invoker not set on ar_unpaid_orders';
  END IF;
  RAISE NOTICE '✅ ar_unpaid_orders now respects orders RLS (staff see all AR, customers see only their own).';
END $pf$;

COMMIT;
