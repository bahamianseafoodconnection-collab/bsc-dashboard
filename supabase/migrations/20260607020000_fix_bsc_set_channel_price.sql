CREATE OR REPLACE FUNCTION public.bsc_set_channel_price(p_product_id uuid, p_channel pricing_channel, p_margin numeric, p_user uuid DEFAULT NULL::uuid)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE cur_cost numeric; v_mult numeric; v_vatcode char(1); v_vatrate numeric; v_base numeric; v_price numeric(12,2);
BEGIN
  IF p_margin IS NULL OR p_margin < 0 THEN RAISE EXCEPTION 'margin must be >= 0 (got %)', p_margin; END IF;
  v_mult := 1 + p_margin;
  SELECT cost_per_unit INTO cur_cost FROM public.product_costs WHERE product_id = p_product_id AND is_current = true AND cost_per_unit > 0 ORDER BY effective_from DESC NULLS LAST LIMIT 1;
  IF cur_cost IS NULL THEN RAISE EXCEPTION 'product has no current cost — set a cost first'; END IF;
  SELECT vat_code INTO v_vatcode FROM public.products WHERE id = p_product_id;
  v_vatrate := CASE v_vatcode WHEN 'T' THEN 0.10 WHEN 'F' THEN 0.05 ELSE 0 END;
  v_base := (cur_cost * v_mult) / 0.96;
  v_price := round((v_base * (1 + v_vatrate))::numeric, 2);
  UPDATE public.product_pricing SET is_current = false WHERE product_id = p_product_id AND channel = p_channel AND is_current = true;
  INSERT INTO public.product_pricing (product_id, channel, pricing_mode, manual_unit_price, margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
  VALUES (p_product_id, p_channel, 'formula', v_price, v_mult, (1 + v_vatrate), 0,0,0,0,0, now(), true, true, p_user);
  RETURN v_price;
END $function$;
