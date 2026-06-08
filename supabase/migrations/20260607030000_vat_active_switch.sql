CREATE TABLE IF NOT EXISTS public.org_settings (
  id boolean PRIMARY KEY DEFAULT true,
  vat_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_settings_singleton CHECK (id = true)
);
INSERT INTO public.org_settings (id, vat_active) VALUES (true, false) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_settings_admin_all ON public.org_settings;
CREATE POLICY org_settings_admin_all ON public.org_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS org_settings_staff_read ON public.org_settings;
CREATE POLICY org_settings_staff_read ON public.org_settings FOR SELECT TO authenticated USING (public.is_staff());

CREATE OR REPLACE FUNCTION public.bsc_set_channel_price(p_product_id uuid, p_channel pricing_channel, p_margin numeric, p_user uuid DEFAULT NULL::uuid)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE cur_cost numeric; v_mult numeric; v_vatcode char(1); v_vatrate numeric; v_vat_active boolean; v_base numeric; v_price numeric(12,2);
BEGIN
  IF p_margin IS NULL OR p_margin < 0 THEN RAISE EXCEPTION 'margin must be >= 0 (got %)', p_margin; END IF;
  v_mult := 1 + p_margin;
  SELECT cost_per_unit INTO cur_cost FROM public.product_costs WHERE product_id = p_product_id AND is_current = true AND cost_per_unit > 0 ORDER BY effective_from DESC NULLS LAST LIMIT 1;
  IF cur_cost IS NULL THEN RAISE EXCEPTION 'product has no current cost — set a cost first'; END IF;
  SELECT vat_code INTO v_vatcode FROM public.products WHERE id = p_product_id;
  SELECT vat_active INTO v_vat_active FROM public.org_settings WHERE id = true;
  v_vatrate := CASE WHEN COALESCE(v_vat_active, false) THEN CASE v_vatcode WHEN 'T' THEN 0.10 WHEN 'F' THEN 0.05 ELSE 0 END ELSE 0 END;
  v_base := (cur_cost * v_mult) / 0.96;
  v_price := round((v_base * (1 + v_vatrate))::numeric, 2);
  UPDATE public.product_pricing SET is_current = false WHERE product_id = p_product_id AND channel = p_channel AND is_current = true;
  INSERT INTO public.product_pricing (product_id, channel, pricing_mode, manual_unit_price, margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct, vat_levy_pct, per_transaction_fee, service_fee_pct, effective_from, is_current, is_active, recorded_by)
  VALUES (p_product_id, p_channel, 'formula', v_price, v_mult, (1 + v_vatrate), 0,0,0,0,0, now(), true, true, p_user);
  RETURN v_price;
END $function$;
