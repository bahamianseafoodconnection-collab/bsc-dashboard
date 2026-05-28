-- =====================================================================
-- BSC Migration: 20260528220000_lock_cogs_tables.sql
--
-- order_cogs_lines + financial_config hold cost / supplier / profit data.
-- Lock them to staff-only reads (RLS), so the supplier_cogs view
-- (security_invoker) only returns data to staff and a logged-in customer
-- can't read what BSC pays suppliers. The capture trigger is SECURITY
-- DEFINER so it still writes regardless of RLS.
-- =====================================================================

BEGIN;

ALTER TABLE public.order_cogs_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cogs_lines_staff_read ON public.order_cogs_lines;
CREATE POLICY cogs_lines_staff_read ON public.order_cogs_lines
  FOR SELECT USING (public.is_staff());

ALTER TABLE public.financial_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_config_staff_read ON public.financial_config;
CREATE POLICY financial_config_staff_read ON public.financial_config
  FOR SELECT USING (public.is_staff());

DO $pf$
BEGIN
  RAISE NOTICE '✅ COGS + financial_config locked to staff (is_staff). Supplier cost data no longer readable by customers.';
END $pf$;

COMMIT;
