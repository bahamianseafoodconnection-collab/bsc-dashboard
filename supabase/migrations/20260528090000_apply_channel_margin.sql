-- =====================================================================
-- BSC Migration: 20260528090000_apply_channel_margin.sql
--
-- Founder direction 2026-05-28: "in the live Inventory spreadsheet allow
-- margin change to all products across all channels."
--
-- Background: channel_markups holds the per-channel margin and the
-- trg_recalc_channel_prices_on_purchase trigger applies it — but ONLY on
-- the next cost receipt for each product. So editing a margin today did
-- nothing to existing prices until each product was next purchased.
--
-- This adds bsc_apply_channel_margin(): set a channel's margin AND
-- immediately reprice every product currently on that channel from its
-- live cost × (1 + margin). Reuses the exact pricing math + immutable-
-- history pattern as the trigger (retire is_current row → insert new).
--
-- Eligibility for repricing a product on a channel:
--   * product is active AND has a current cost > 0, AND either
--   * the matching sell_* flag is on (nassau/andros/online/wholesale),
--     OR the product already has a current price row on that channel
--     (covers us_resale, which has no sell_* flag).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bsc_apply_channel_margin(
  p_channel pricing_channel,
  p_margin  numeric,
  p_user    uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r          RECORD;
  new_price  numeric(12,2);
  repriced   integer := 0;
BEGIN
  IF p_margin IS NULL OR p_margin < 0 OR p_margin > 5 THEN
    RAISE EXCEPTION 'margin_pct must be between 0 and 5 (got %)', p_margin;
  END IF;

  -- 1) Persist the new margin (config source of truth).
  UPDATE public.channel_markups
     SET margin_pct = p_margin,
         updated_at = now(),
         updated_by = p_user
   WHERE channel = p_channel;

  IF NOT FOUND THEN
    INSERT INTO public.channel_markups (channel, margin_pct, updated_by)
    VALUES (p_channel, p_margin, p_user);
  END IF;

  -- 2) Reprice every eligible product on this channel from live cost.
  FOR r IN
    SELECT p.id AS product_id, pc.cost_per_unit
      FROM public.products p
      JOIN public.product_costs pc
        ON pc.product_id = p.id AND pc.is_current = true AND pc.cost_per_unit > 0
     WHERE p.status = 'active'
       AND (
            (p_channel = 'nassau_pos'::pricing_channel      AND p.sell_nassau)
         OR (p_channel = 'andros_pos'::pricing_channel      AND p.sell_andros)
         OR (p_channel = 'online_market'::pricing_channel   AND p.sell_online)
         OR (p_channel = 'local_wholesale'::pricing_channel AND p.sell_wholesale)
         OR EXISTS (
              SELECT 1 FROM public.product_pricing pp
               WHERE pp.product_id = p.id AND pp.channel = p_channel AND pp.is_current = true
            )
       )
  LOOP
    new_price := round((r.cost_per_unit * (1 + p_margin))::numeric, 2);

    UPDATE public.product_pricing
       SET is_current = false
     WHERE product_id = r.product_id
       AND channel    = p_channel
       AND is_current  = true;

    INSERT INTO public.product_pricing (
      product_id, channel, pricing_mode, manual_unit_price,
      margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
      vat_levy_pct, per_transaction_fee, service_fee_pct,
      effective_from, is_current, is_active, recorded_by
    ) VALUES (
      r.product_id, p_channel, 'manual_override', new_price,
      1.0, 1.0, 0, 0, 0, 0, 0,
      now(), true, true, p_user
    );

    repriced := repriced + 1;
  END LOOP;

  RETURN repriced;
END;
$$;

COMMENT ON FUNCTION public.bsc_apply_channel_margin(pricing_channel, numeric, uuid)
  IS 'Set a channel margin in channel_markups AND immediately reprice every '
     'active product on that channel from its current cost × (1 + margin). '
     'Returns the count of products repriced. Mirrors the on-purchase recalc '
     'trigger but applies to ALL products at once. SECURITY DEFINER so the '
     'founder admin UI can call it via RPC without direct table grants.';

-- Callable via PostgREST RPC by signed-in staff; the API route gates roles.
GRANT EXECUTE ON FUNCTION public.bsc_apply_channel_margin(pricing_channel, numeric, uuid) TO authenticated;

-- Verify
DO $pf$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'bsc_apply_channel_margin'
  ) THEN
    RAISE EXCEPTION 'bsc_apply_channel_margin not created';
  END IF;
  RAISE NOTICE '✅ bsc_apply_channel_margin ready — margin changes now cascade to all products on a channel instantly';
END $pf$;

COMMIT;
