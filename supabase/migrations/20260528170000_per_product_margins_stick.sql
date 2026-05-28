-- =====================================================================
-- BSC Migration: 20260528170000_per_product_margins_stick.sql
--
-- Founder direction 2026-05-28 (chose option B): per-product margins must
-- STICK — a product keeps its own margin per channel, and a cost receipt
-- re-prices it from THAT margin, not the global default. This kills the
-- "margins fluctuating" problem (cost receipts were resetting every
-- product to the global channel margin via recalc_channel_prices_on_purchase).
--
-- Source of truth = product_pricing.margin_multiplier (= 1 + margin, i.e.
-- price ÷ cost). Steps:
--   1. Backfill margin_multiplier on current price rows from price ÷ cost
--      (it was always left at the 1.0 default).
--   2. bsc_set_channel_price(product, channel, margin) — atomic retire +
--      insert that STORES the margin. The Edit/Add UI calls this via RPC
--      (also fixes the "No editable fields" save error, since it's one
--      atomic call that always reports success).
--   3. Rewrite recalc_channel_prices_on_purchase: on a cost receipt, use
--      each channel's STORED margin_multiplier; only fall back to the
--      global channel_markups margin when a channel has no price yet.
-- =====================================================================

BEGIN;

-- 1. Backfill the real per-product margin onto current price rows.
UPDATE public.product_pricing pp
SET margin_multiplier = round((pp.manual_unit_price / c.cost_per_unit)::numeric, 6)
FROM public.product_costs c
WHERE c.product_id = pp.product_id AND c.is_current = true AND c.cost_per_unit > 0
  AND pp.is_current = true
  AND pp.manual_unit_price IS NOT NULL AND pp.manual_unit_price > 0;

-- 2. Atomic "set this channel's price from a margin %", storing the margin.
CREATE OR REPLACE FUNCTION public.bsc_set_channel_price(
  p_product_id uuid,
  p_channel    pricing_channel,
  p_margin     numeric,          -- fraction, e.g. 0.40 = 40%
  p_user       uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cur_cost numeric;
  v_mult   numeric;
  v_price  numeric(12,2);
BEGIN
  IF p_margin IS NULL OR p_margin < 0 THEN RAISE EXCEPTION 'margin must be >= 0 (got %)', p_margin; END IF;
  v_mult := 1 + p_margin;
  SELECT cost_per_unit INTO cur_cost
    FROM public.product_costs
   WHERE product_id = p_product_id AND is_current = true AND cost_per_unit > 0
   ORDER BY effective_from DESC NULLS LAST LIMIT 1;
  IF cur_cost IS NULL THEN RAISE EXCEPTION 'product has no current cost — set a cost first'; END IF;

  v_price := round((cur_cost * v_mult)::numeric, 2);

  UPDATE public.product_pricing
     SET is_current = false
   WHERE product_id = p_product_id AND channel = p_channel AND is_current = true;

  INSERT INTO public.product_pricing (
    product_id, channel, pricing_mode, manual_unit_price, margin_multiplier,
    vat_multiplier, shipping_per_lb, customs_duty_pct, vat_levy_pct,
    per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by
  ) VALUES (
    p_product_id, p_channel, 'manual_override', v_price, v_mult,
    1.0, 0, 0, 0, 0, 0, now(), true, true, p_user
  );
  RETURN v_price;
END $$;

GRANT EXECUTE ON FUNCTION public.bsc_set_channel_price(uuid, pricing_channel, numeric, uuid) TO authenticated;

-- 3. Recalc on cost receipt now PRESERVES each channel's stored margin.
CREATE OR REPLACE FUNCTION public.recalc_channel_prices_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prod RECORD;
  m    RECORD;
  v_mult    numeric;
  new_price numeric(12,2);
BEGIN
  IF NEW.cost_type::text != 'purchase' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_current, false) IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.cost_per_unit IS NULL OR NEW.cost_per_unit <= 0 THEN RETURN NEW; END IF;

  SELECT sell_nassau, sell_andros, sell_online, sell_wholesale
    INTO prod FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR m IN
    SELECT cm.channel, cm.margin_pct
      FROM public.channel_markups cm
     WHERE (cm.channel = 'nassau_pos'::pricing_channel      AND prod.sell_nassau)
        OR (cm.channel = 'andros_pos'::pricing_channel      AND prod.sell_andros)
        OR (cm.channel = 'online_market'::pricing_channel   AND prod.sell_online)
        OR (cm.channel = 'local_wholesale'::pricing_channel AND prod.sell_wholesale)
  LOOP
    -- Use the product's STORED margin for this channel; fall back to the
    -- global channel margin only if this channel was never priced.
    SELECT margin_multiplier INTO v_mult
      FROM public.product_pricing
     WHERE product_id = NEW.product_id AND channel = m.channel AND is_current = true
     LIMIT 1;
    IF v_mult IS NULL OR v_mult <= 0 THEN v_mult := 1 + m.margin_pct; END IF;

    new_price := round((NEW.cost_per_unit * v_mult)::numeric, 2);

    UPDATE public.product_pricing SET is_current = false
     WHERE product_id = NEW.product_id AND channel = m.channel AND is_current = true;

    INSERT INTO public.product_pricing (
      product_id, channel, pricing_mode, manual_unit_price, margin_multiplier,
      vat_multiplier, shipping_per_lb, customs_duty_pct, vat_levy_pct,
      per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by
    ) VALUES (
      NEW.product_id, m.channel, 'manual_override', new_price, v_mult,
      1.0, 0, 0, 0, 0, 0, now(), true, true, NEW.recorded_by
    );
  END LOOP;
  RETURN NEW;
END $$;

DO $pf$
BEGIN
  RAISE NOTICE '✅ Per-product margins now stick. margin_multiplier backfilled; cost receipts preserve each channel''s margin; bsc_set_channel_price ready.';
END $pf$;

COMMIT;
