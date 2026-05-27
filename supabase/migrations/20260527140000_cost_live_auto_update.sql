-- =====================================================================
-- BSC Migration: 20260527140000_cost_live_auto_update.sql
--
-- Founder direction 2026-05-27: "do this strong unbreakable, clear
-- positive results just keep cost live and updated easily and always
-- on every purchase".
--
-- Design (DB-layer, cannot be bypassed by app code):
--
--   1. Adds 'purchase' to cost_type enum. Today only 'opening_balance'
--      is in use; 'purchase' represents a new stock receipt at a
--      possibly different per-unit cost.
--
--   2. Creates channel_markups config table — single source of truth
--      for per-channel margin. Seeded with founder's XLSX row-4 rates.
--      Editable by founder anytime via simple UPDATE; trigger reads
--      live so any margin change cascades on the NEXT cost receipt.
--
--   3. Creates trigger trg_recalc_channel_prices_on_purchase on
--      product_costs AFTER INSERT. When a new cost row with
--      cost_type='purchase' lands:
--        - reads the product's sell_nassau / sell_andros / sell_online
--          / sell_wholesale flags
--        - for each ACTIVE channel, computes new price =
--          new_cost × (1 + channel_markups.margin_pct)
--        - flips the existing is_current=true price row for that
--          channel to is_current=false
--        - INSERTs new product_pricing row with is_current=true
--      Old pricing rows preserved as history (immutable per existing
--      schema). Trigger is idempotent — re-firing on the same row is
--      a no-op because is_current was already flipped.
--
--   4. The 'opening_balance' code path (used by /api/supplier/add-product
--      and the v2 seed migration) is UNTOUCHED. Trigger has an early
--      RETURN for cost_type != 'purchase' so existing flows continue.
--
-- Result: BSC staff can record a wholesale-receipt (new stock from
-- supplier at a new price), and within milliseconds the per-channel
-- retail/wholesale prices update everywhere — POS, /market, supplier
-- admin, receipts. No room for human error, no risk of forgetting to
-- update prices, no stale margin math.
--
-- Founder hint: "always on every purchase" = every inventory RECEIPT
-- from a supplier. Customer purchases (sales) do not change cost —
-- they decrement inventory.qty_on_hand via the existing sale flow.
-- =====================================================================

BEGIN;

-- ─── 1. cost_type enum: add 'purchase' ────────────────────────────────
ALTER TYPE cost_type ADD VALUE IF NOT EXISTS 'purchase';

-- ─── 2. channel_markups config table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_markups (
  channel    pricing_channel PRIMARY KEY,
  margin_pct numeric(5,4)    NOT NULL CHECK (margin_pct >= 0 AND margin_pct <= 5),
  notes      text,
  updated_at timestamptz     NOT NULL DEFAULT now(),
  updated_by uuid            REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.channel_markups
  IS 'Per-channel margin multipliers used by the auto-recalc trigger. '
     'price = cost × (1 + margin_pct). Editable by founder. The trigger '
     'reads live values, so any UPDATE here cascades on the next cost '
     'receipt for products on that channel.';

COMMENT ON COLUMN public.channel_markups.margin_pct
  IS '0.35 = 35% margin. Examples (founder XLSX row 4 schedule): '
     '0.35 nassau_pos / 0.45 andros_pos / 0.30 online_market / '
     '0.20 local_wholesale / 0.15 us_resale.';

-- Seed defaults (idempotent — INSERT ON CONFLICT DO NOTHING)
INSERT INTO public.channel_markups (channel, margin_pct, notes) VALUES
  ('nassau_pos',      0.35, 'Retail margin at Nassau location'),
  ('andros_pos',      0.45, 'Retail margin at Andros location (higher overhead)'),
  ('online_market',   0.30, 'Online retail — bscbahamas.com /market'),
  ('local_wholesale', 0.20, 'Bahamas wholesale customers'),
  ('us_resale',       0.15, 'US export resale (Manny lobster pipeline placeholder)')
ON CONFLICT (channel) DO NOTHING;

GRANT SELECT ON public.channel_markups TO authenticated;
-- No GRANT UPDATE — service-role only (via future founder admin UI)

-- ─── 3. The auto-recalc trigger function ──────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_channel_prices_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  prod RECORD;
  m    RECORD;
  new_price numeric(12,2);
BEGIN
  -- Only act on PURCHASE cost rows. Skip 'opening_balance' so existing
  -- flows (add-product API, seed migrations) are untouched.
  IF NEW.cost_type::text != 'purchase' THEN
    RETURN NEW;
  END IF;
  -- Only act on the new current row (defensive — costs_expire_previous
  -- flips OLD rows to is_current=false; we only care about the new one)
  IF COALESCE(NEW.is_current, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- Skip zero/negative costs (data hygiene)
  IF NEW.cost_per_unit IS NULL OR NEW.cost_per_unit <= 0 THEN
    RETURN NEW;
  END IF;

  -- Read product's channel flags
  SELECT sell_nassau, sell_andros, sell_online, sell_wholesale
    INTO prod
    FROM public.products
   WHERE id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE WARNING 'recalc_channel_prices_on_purchase: product % not found', NEW.product_id;
    RETURN NEW;
  END IF;

  -- For each channel the product sells on, compute + insert new price.
  -- Mapping product.sell_* flag → channel enum:
  --   sell_nassau    → nassau_pos
  --   sell_andros    → andros_pos
  --   sell_online    → online_market
  --   sell_wholesale → local_wholesale  (us_resale stays manual for now)
  FOR m IN
    SELECT cm.channel, cm.margin_pct
      FROM public.channel_markups cm
     WHERE (cm.channel = 'nassau_pos'::pricing_channel      AND prod.sell_nassau)
        OR (cm.channel = 'andros_pos'::pricing_channel      AND prod.sell_andros)
        OR (cm.channel = 'online_market'::pricing_channel   AND prod.sell_online)
        OR (cm.channel = 'local_wholesale'::pricing_channel AND prod.sell_wholesale)
  LOOP
    new_price := round((NEW.cost_per_unit * (1 + m.margin_pct))::numeric, 2);

    -- Retire the previous current row for this (product, channel)
    UPDATE public.product_pricing
       SET is_current = false
     WHERE product_id = NEW.product_id
       AND channel    = m.channel
       AND is_current = true;

    -- Insert new pricing row with is_current=true
    INSERT INTO public.product_pricing (
      product_id, channel, pricing_mode, manual_unit_price,
      margin_multiplier, vat_multiplier, shipping_per_lb, customs_duty_pct,
      vat_levy_pct, per_transaction_fee, service_fee_pct,
      effective_from, is_current, is_active, recorded_by
    ) VALUES (
      NEW.product_id, m.channel, 'manual_override', new_price,
      1.0, 1.0, 0, 0, 0, 0, 0,
      now(), true, true, NEW.recorded_by
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.recalc_channel_prices_on_purchase()
  IS 'Auto-recalc per-channel product_pricing when a new cost_type=purchase '
     'row lands in product_costs. Reads channel_markups for live margins. '
     'Skips opening_balance so seed/add-product flows are untouched. '
     'SECURITY DEFINER so it can write product_pricing regardless of who '
     'triggered the cost INSERT.';

-- Drop existing trigger (if re-running this migration) + recreate
DROP TRIGGER IF EXISTS trg_recalc_channel_prices_on_purchase ON public.product_costs;
CREATE TRIGGER trg_recalc_channel_prices_on_purchase
  AFTER INSERT ON public.product_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_channel_prices_on_purchase();

-- ─── 4. Post-flight verification ──────────────────────────────────────
DO $pf$
DECLARE
  enum_has_purchase boolean;
  markups_count int;
  trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'cost_type' AND e.enumlabel = 'purchase'
  ) INTO enum_has_purchase;

  SELECT COUNT(*) INTO markups_count FROM public.channel_markups;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recalc_channel_prices_on_purchase'
  ) INTO trigger_exists;

  RAISE NOTICE '──────────────────────────────────────';
  RAISE NOTICE 'COST-LIVE AUTO-UPDATE — MIGRATION RESULT';
  RAISE NOTICE '  cost_type enum has ''purchase'':  %', enum_has_purchase;
  RAISE NOTICE '  channel_markups rows seeded:    %', markups_count;
  RAISE NOTICE '  trigger created:                %', trigger_exists;
  RAISE NOTICE '──────────────────────────────────────';
  RAISE NOTICE 'TO TEST: insert a purchase cost row for any active product:';
  RAISE NOTICE '  INSERT INTO product_costs (product_id, supplier_id, cost_type,';
  RAISE NOTICE '    cost_per_unit, unit_of_measure, is_current, effective_from)';
  RAISE NOTICE '  VALUES (''<some-product-uuid>'', NULL, ''purchase'', 6.50, ''lb'', true, now());';
  RAISE NOTICE 'Then SELECT * FROM product_pricing WHERE product_id = ''<that-uuid>''';
  RAISE NOTICE 'should show fresh rows with prices = 6.50 × (1 + margin) per active channel.';

  IF NOT enum_has_purchase OR markups_count < 5 OR NOT trigger_exists THEN
    RAISE EXCEPTION 'Post-flight FAILED: enum=%, markups=%, trigger=%',
                    enum_has_purchase, markups_count, trigger_exists;
  END IF;
END $pf$;

COMMIT;
