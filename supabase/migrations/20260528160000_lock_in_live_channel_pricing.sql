-- =====================================================================
-- BSC Migration: 20260528160000_lock_in_live_channel_pricing.sql
--
-- Founder direction 2026-05-28: "inventory needs to be consistent and
-- live ... make SQL to lock it in to avoid sticking and losing
-- information."
--
-- Self-healing guarantee at the DB layer: any ACTIVE product that is
-- flagged for a channel (sell_nassau/andros/online/wholesale) AND has a
-- current cost > 0 will ALWAYS have a current price on that channel
-- (cost × channel_markups.margin_pct). It only FILLS missing prices — it
-- never overwrites an existing manual/current price. Fires no matter
-- which intake path created or edited the product, so inventory is
-- consistent + live regardless of where it was entered.
--
-- Complements (does not replace) recalc_channel_prices_on_purchase: that
-- recomputes prices on a 'purchase' cost receipt; this one back-fills any
-- channel left unpriced (opening_balance costs, a sell_* flag flipped on,
-- a product added by any other surface).
-- =====================================================================

BEGIN;

-- Core: ensure every enabled channel for a product has a current price.
CREATE OR REPLACE FUNCTION public.ensure_channel_prices(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prod      RECORD;
  cur_cost  numeric;
  r         RECORD;
  new_price numeric(12,2);
BEGIN
  SELECT status, sell_nassau, sell_andros, sell_online, sell_wholesale
    INTO prod
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND OR prod.status <> 'active' THEN RETURN; END IF;

  SELECT cost_per_unit INTO cur_cost
    FROM public.product_costs
   WHERE product_id = p_product_id AND is_current = true AND cost_per_unit > 0
   ORDER BY effective_from DESC NULLS LAST
   LIMIT 1;
  IF cur_cost IS NULL THEN RETURN; END IF;   -- no cost → can't price (skip)

  FOR r IN
    SELECT cm.channel, cm.margin_pct
      FROM public.channel_markups cm
     WHERE (cm.channel = 'nassau_pos'::pricing_channel      AND prod.sell_nassau)
        OR (cm.channel = 'andros_pos'::pricing_channel      AND prod.sell_andros)
        OR (cm.channel = 'online_market'::pricing_channel   AND prod.sell_online)
        OR (cm.channel = 'local_wholesale'::pricing_channel AND prod.sell_wholesale)
  LOOP
    -- Only fill when this channel has NO current price (never overwrite).
    IF NOT EXISTS (
      SELECT 1 FROM public.product_pricing pp
       WHERE pp.product_id = p_product_id AND pp.channel = r.channel AND pp.is_current = true
    ) THEN
      new_price := round((cur_cost * (1 + r.margin_pct))::numeric, 2);
      INSERT INTO public.product_pricing (
        product_id, channel, pricing_mode, manual_unit_price,
        margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
        vat_levy_pct, per_transaction_fee, service_fee_pct,
        effective_from, is_current, is_active, recorded_by
      ) VALUES (
        p_product_id, r.channel, 'manual_override', new_price,
        1.0, 1.0, 0, 0, 0, 0, 0, now(), true, true, NULL
      );
    END IF;
  END LOOP;
END $$;

-- Trigger A: product flags / status changed → ensure prices.
CREATE OR REPLACE FUNCTION public.trg_products_ensure_prices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.ensure_channel_prices(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_ensure_prices ON public.products;
CREATE TRIGGER trg_products_ensure_prices
  AFTER INSERT OR UPDATE OF sell_nassau, sell_andros, sell_online, sell_wholesale, status
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_ensure_prices();

-- Trigger B: a new current cost landed (any cost_type) → ensure prices.
CREATE OR REPLACE FUNCTION public.trg_costs_ensure_prices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.is_current, false) THEN
    PERFORM public.ensure_channel_prices(NEW.product_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_costs_ensure_prices ON public.product_costs;
CREATE TRIGGER trg_costs_ensure_prices
  AFTER INSERT ON public.product_costs
  FOR EACH ROW EXECUTE FUNCTION public.trg_costs_ensure_prices();

-- One-time heal of anything currently flagged-but-unpriced.
DO $heal$
DECLARE p RECORD; BEGIN
  FOR p IN SELECT id FROM public.products WHERE status = 'active' LOOP
    PERFORM public.ensure_channel_prices(p.id);
  END LOOP;
END $heal$;

-- Verify: no active product is flagged for a channel yet missing its price
-- (only cost-less products may remain — they can't be auto-priced).
DO $pf$
DECLARE drift int; BEGIN
  SELECT COUNT(*) INTO drift
  FROM public.products p
  WHERE p.status='active'
    AND EXISTS (SELECT 1 FROM public.product_costs c WHERE c.product_id=p.id AND c.is_current AND c.cost_per_unit>0)
    AND (
      (p.sell_nassau    AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='nassau_pos'::pricing_channel      AND pp.is_current))
   OR (p.sell_andros    AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='andros_pos'::pricing_channel      AND pp.is_current))
   OR (p.sell_online    AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='online_market'::pricing_channel   AND pp.is_current))
   OR (p.sell_wholesale AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='local_wholesale'::pricing_channel AND pp.is_current))
    );
  IF drift > 0 THEN RAISE EXCEPTION 'Lock-in incomplete: % costed products still unpriced on an enabled channel', drift; END IF;
  RAISE NOTICE '✅ Live-pricing lock-in active. Every active, costed, channel-flagged product is now priced; triggers keep it that way.';
END $pf$;

COMMIT;
