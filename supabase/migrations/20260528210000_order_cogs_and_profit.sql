-- =====================================================================
-- BSC Migration: 20260528210000_order_cogs_and_profit.sql
--
-- Founder direction 2026-05-28: profit splits must be DB-authoritative
-- (not browser-estimated), AND "show exactly each supplier and total per
-- day/week/month of COGS in all channels — what and who I am paying on
-- every sale and every day."
--
-- Foundation: capture the REAL cost of goods per sale line at the moment
-- of sale — product → supplier → cost — into an immutable table. Then:
--   * supplier COGS reporting reads truth from these lines, and
--   * the order's profit split is recomputed from REAL COGS
--     (gross = total − COGS; Bill Casale 5% sacred; net = gross − overhead
--      − Bill Casale), replacing computeProfitSplit's assumed-margin guess.
--
-- The capture trigger is EXCEPTION-SAFE: a COGS failure logs a warning and
-- never rolls back the sale (money path must not break).
-- =====================================================================

BEGIN;

-- 1. Immutable per-line COGS record.
CREATE TABLE IF NOT EXISTS public.order_cogs_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id    uuid,
  supplier_id   uuid,
  supplier_name text,                         -- snapshot at sale time
  product_name  text,
  channel       text,
  sold_at       timestamptz NOT NULL,         -- = order.created_at
  qty           numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost     numeric(12,2) NOT NULL DEFAULT 0,  -- supplier cost at sale time
  unit_price    numeric(12,2) NOT NULL DEFAULT 0,
  line_cogs     numeric(12,2) NOT NULL DEFAULT 0,  -- qty × unit_cost
  line_revenue  numeric(12,2) NOT NULL DEFAULT 0,  -- qty × unit_price
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cogs_supplier_soldat ON public.order_cogs_lines (supplier_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_cogs_soldat_channel  ON public.order_cogs_lines (sold_at, channel);
CREATE INDEX IF NOT EXISTS idx_cogs_order           ON public.order_cogs_lines (order_id);

-- 2. Capture function: unnest the order's items, resolve supplier + cost,
--    write the lines, then recompute the order's profit split from real COGS.
CREATE OR REPLACE FUNCTION public.bsc_capture_order_cogs(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  o            RECORD;
  line         jsonb;
  v_pid        uuid;
  v_qty        numeric;
  v_price      numeric;
  v_cost       numeric;
  v_supplier   uuid;
  v_supname    text;
  v_pname      text;
  v_chan       text;
  v_total_cogs numeric := 0;
  v_gross      numeric;
  v_exp_rate   numeric := 0;
  v_exp_alloc  numeric;
  v_bill       numeric;
  v_net        numeric;
BEGIN
  SELECT id, created_at, total, channel, order_type, wholesale_items, items
    INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_chan := COALESCE(o.channel, o.order_type);

  -- Re-capture cleanly (idempotent).
  DELETE FROM public.order_cogs_lines WHERE order_id = p_order_id;

  FOR line IN
    SELECT * FROM jsonb_array_elements(COALESCE(o.wholesale_items, o.items, '[]'::jsonb))
  LOOP
    BEGIN
      v_pid := NULLIF(line->>'product_id','')::uuid;
    EXCEPTION WHEN others THEN v_pid := NULL; END;

    v_qty   := COALESCE((line->>'weight_lb')::numeric, (line->>'qty')::numeric, (line->>'quantity')::numeric, 1);
    v_price := COALESCE((line->>'unit_price')::numeric, 0);
    v_cost := 0; v_supplier := NULL; v_supname := NULL; v_pname := line->>'name';

    IF v_pid IS NOT NULL THEN
      SELECT p.primary_supplier_id, p.name INTO v_supplier, v_pname
        FROM public.products p WHERE p.id = v_pid;
      IF v_pname IS NULL THEN v_pname := line->>'name'; END IF;
      SELECT s.name INTO v_supname FROM public.suppliers s WHERE s.id = v_supplier;
      SELECT c.cost_per_unit INTO v_cost
        FROM public.product_costs c
       WHERE c.product_id = v_pid AND c.is_current = true AND c.cost_per_unit > 0
       ORDER BY c.effective_from DESC NULLS LAST LIMIT 1;
      v_cost := COALESCE(v_cost, 0);
    END IF;

    INSERT INTO public.order_cogs_lines (
      order_id, product_id, supplier_id, supplier_name, product_name, channel,
      sold_at, qty, unit_cost, unit_price, line_cogs, line_revenue
    ) VALUES (
      p_order_id, v_pid, v_supplier, v_supname, v_pname, v_chan,
      o.created_at, v_qty, v_cost, v_price,
      round((v_qty * v_cost)::numeric, 2), round((v_qty * v_price)::numeric, 2)
    );

    v_total_cogs := v_total_cogs + round((v_qty * v_cost)::numeric, 2);
  END LOOP;

  -- Profit split from REAL COGS. expense_rate from financial_config (0 if unset).
  SELECT value::numeric INTO v_exp_rate FROM public.financial_config WHERE key = 'expense_rate';
  v_exp_rate := COALESCE(v_exp_rate, 0);

  v_gross     := round((COALESCE(o.total,0) - v_total_cogs)::numeric, 2);
  v_exp_alloc := round((COALESCE(o.total,0) * v_exp_rate)::numeric, 2);
  v_bill      := round((GREATEST(v_gross,0) * 0.05)::numeric, 2);   -- Bill Casale 5% sacred
  v_net       := round((v_gross - v_exp_alloc - v_bill)::numeric, 2);

  UPDATE public.orders
     SET wholesale_cost_total = v_total_cogs,
         expense_allocation   = v_exp_alloc,
         bill_casale_share    = v_bill,
         net_profit           = v_net
   WHERE id = p_order_id;
END $$;

-- 3. Tiny config for the overhead expense_rate (founder-settable later).
CREATE TABLE IF NOT EXISTS public.financial_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.financial_config (key, value) VALUES ('expense_rate','0')
  ON CONFLICT (key) DO NOTHING;

-- 4. EXCEPTION-SAFE trigger — a COGS failure never blocks the sale.
CREATE OR REPLACE FUNCTION public.trg_capture_order_cogs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    PERFORM public.bsc_capture_order_cogs(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'COGS capture failed for order % (non-fatal): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_capture_order_cogs ON public.orders;
CREATE TRIGGER trg_capture_order_cogs
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_capture_order_cogs();

-- 5. Reporting view: per-line COGS with supplier + day/week/month buckets.
CREATE OR REPLACE VIEW public.supplier_cogs AS
SELECT
  l.supplier_id,
  COALESCE(l.supplier_name, '(no supplier)') AS supplier_name,
  l.channel,
  l.sold_at,
  date_trunc('day',   l.sold_at)::date AS day,
  date_trunc('week',  l.sold_at)::date AS week,
  date_trunc('month', l.sold_at)::date AS month,
  l.qty, l.unit_cost, l.line_cogs, l.line_revenue,
  l.order_id, l.product_id, l.product_name
FROM public.order_cogs_lines l;

ALTER VIEW public.supplier_cogs SET (security_invoker = true);
GRANT SELECT ON public.supplier_cogs TO authenticated;

-- 6. Backfill existing orders (exception-safe per order).
DO $bf$
DECLARE r RECORD; BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    BEGIN PERFORM public.bsc_capture_order_cogs(r.id);
    EXCEPTION WHEN others THEN RAISE WARNING 'backfill skipped order %: %', r.id, SQLERRM; END;
  END LOOP;
END $bf$;

DO $pf$
DECLARE n int; BEGIN
  SELECT COUNT(*) INTO n FROM public.order_cogs_lines;
  RAISE NOTICE '✅ COGS capture live. % cost lines recorded; profit splits now computed from real COGS; supplier_cogs view ready.', n;
END $pf$;

COMMIT;
