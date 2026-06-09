CREATE OR REPLACE FUNCTION public.bsc_apply_channel_margin(p_channel pricing_channel, p_margin numeric, p_user uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r            RECORD;
  v_vat_active boolean;
  v_vatrate    numeric;
  v_mult       numeric;
  v_base       numeric;
  new_price    numeric(12,2);
  repriced     integer := 0;
  skipped      integer := 0;
BEGIN
  IF p_margin IS NULL OR p_margin < 0 OR p_margin > 5 THEN
    RAISE EXCEPTION 'margin_pct must be between 0 and 5 (got %)', p_margin;
  END IF;

  v_mult := 1 + p_margin;
  SELECT vat_active INTO v_vat_active FROM public.org_settings WHERE id = true;

  UPDATE public.channel_markups
     SET margin_pct = p_margin, updated_at = now(), updated_by = p_user
   WHERE channel = p_channel;
  IF NOT FOUND THEN
    INSERT INTO public.channel_markups (channel, margin_pct, updated_by)
    VALUES (p_channel, p_margin, p_user);
  END IF;

  FOR r IN
    SELECT p.id AS product_id, p.vat_code, pc.cost_per_unit
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
    IF EXISTS (
      SELECT 1 FROM public.product_pricing pp
       WHERE pp.product_id = r.product_id AND pp.channel = p_channel
         AND pp.is_current = true AND pp.price_locked = true
    ) THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    v_vatrate := CASE WHEN COALESCE(v_vat_active, false)
                      THEN CASE r.vat_code WHEN 'T' THEN 0.10 WHEN 'F' THEN 0.05 ELSE 0 END
                      ELSE 0 END;
    v_base    := (r.cost_per_unit * v_mult) / 0.96;
    new_price := round((v_base * (1 + v_vatrate))::numeric, 2);

    UPDATE public.product_pricing
       SET is_current = false
     WHERE product_id = r.product_id AND channel = p_channel AND is_current = true;

    INSERT INTO public.product_pricing (
      product_id, channel, pricing_mode, manual_unit_price,
      margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
      vat_levy_pct, per_transaction_fee, service_fee_pct,
      effective_from, is_current, is_active, recorded_by
    ) VALUES (
      r.product_id, p_channel, 'formula', new_price,
      v_mult, (1 + v_vatrate), 0, 0, 0, 0, 0,
      now(), true, true, p_user
    );

    repriced := repriced + 1;
  END LOOP;

  RAISE NOTICE 'bsc_apply_channel_margin: repriced %, skipped % locked', repriced, skipped;
  RETURN repriced;
END;
$function$;
