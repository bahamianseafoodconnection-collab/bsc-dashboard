-- =====================================================================
-- BSC Migration: 20260528140000_backfill_missing_channel_prices.sql
--
-- Founder direction 2026-05-28: "every product added must go live to all
-- selected channels." Audit found ~25 active products flagged for a
-- channel (sell_nassau/andros/online/wholesale) but with NO current price
-- there — flagged-but-not-live. They were added before the add-product
-- flow auto-priced every channel; they have a current cost but no
-- product_pricing rows.
--
-- This backfills ONLY the missing (product, channel) combos:
--   price = current cost × (1 + channel_markups.margin_pct)
-- It is surgical (NOT EXISTS guard) so it never touches a product that
-- already has a current price on that channel — no manual price is
-- overwritten. Idempotent: safe to re-run (re-run inserts nothing).
--
-- Products with no current cost can't be auto-priced and are skipped
-- (they need a cost first).
-- =====================================================================

BEGIN;

INSERT INTO public.product_pricing (
  product_id, channel, pricing_mode, manual_unit_price,
  margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
  vat_levy_pct, per_transaction_fee, service_fee_pct,
  effective_from, is_current, is_active, recorded_by
)
SELECT
  p.id, ch.channel, 'manual_override',
  round((c.cost_per_unit * (1 + cm.margin_pct))::numeric, 2),
  1.0, 1.0, 0, 0, 0, 0, 0,
  now(), true, true, NULL
FROM public.products p
JOIN public.product_costs c
  ON c.product_id = p.id AND c.is_current = true AND c.cost_per_unit > 0
JOIN LATERAL (VALUES
  ('nassau_pos'::pricing_channel,      p.sell_nassau),
  ('andros_pos'::pricing_channel,      p.sell_andros),
  ('online_market'::pricing_channel,   p.sell_online),
  ('local_wholesale'::pricing_channel, p.sell_wholesale)
) AS ch(channel, enabled) ON ch.enabled
JOIN public.channel_markups cm ON cm.channel = ch.channel
WHERE p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_pricing pp
    WHERE pp.product_id = p.id AND pp.channel = ch.channel AND pp.is_current = true
  );

-- Report what's still flagged-but-unpriced (should only be cost-less products)
DO $pf$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.products p
  WHERE p.status='active' AND (
       (p.sell_nassau    AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='nassau_pos'::pricing_channel      AND pp.is_current))
    OR (p.sell_andros    AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='andros_pos'::pricing_channel      AND pp.is_current))
    OR (p.sell_online    AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='online_market'::pricing_channel   AND pp.is_current))
    OR (p.sell_wholesale AND NOT EXISTS (SELECT 1 FROM public.product_pricing pp WHERE pp.product_id=p.id AND pp.channel='local_wholesale'::pricing_channel AND pp.is_current))
  );
  RAISE NOTICE '✅ channel-price backfill done. Still flagged-but-unpriced (these have NO cost — add a cost to price them): %', remaining;
END $pf$;

COMMIT;
