-- =====================================================================
-- BSC Migration: 20260527180000_order_fulfillment_lifecycle.sql
--
-- Online order delivery lifecycle, per founder's 8-stage spec
-- (2026-05-26). Adds fulfillment tracking to orders separate from
-- payment_status (payment = "did money clear", fulfillment = "where is
-- the physical order in the delivery journey").
--
-- Six actionable internal states (the founder's 8 stages collapse to 6
-- — stages 5 "transporting" + 7 "arriving" are sub-moments covered by
-- in_transit + out_for_delivery, no separate DB state needed):
--
--   placed            → Order Placed       (payment confirmed)
--   preparing         → Preparing to Ship  (supplier picking/packing)
--   collected         → In Transit         (BSC driver picked up at supplier)
--   in_transit        → In Transit         (driver en route)
--   out_for_delivery  → Out for Delivery   (driver in customer's area)
--   delivered         → Delivered          (proof captured)
--   cancelled         → Cancelled
--
-- Stored as TEXT (not enum) so adding intermediate states later needs
-- no enum migration. App-layer (lib/order-status.ts) is the validator.
--
-- Also folds in Task #89 delivery-location capture (same table, one
-- migration): delivery_lat / delivery_lng / delivery_directions for the
-- /checkout "drop pin / type directions" feature.
--
-- All columns nullable + additive. Existing orders (POS cash sales)
-- keep fulfillment_status NULL — POS has no delivery lifecycle. Only
-- online_market orders get a status, set to 'placed' at checkout.
-- =====================================================================

BEGIN;

ALTER TABLE public.orders
  -- Fulfillment lifecycle
  ADD COLUMN IF NOT EXISTS fulfillment_status   text,
  ADD COLUMN IF NOT EXISTS preparing_at         timestamptz,
  ADD COLUMN IF NOT EXISTS collected_at         timestamptz,
  ADD COLUMN IF NOT EXISTS collected_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS in_transit_at        timestamptz,
  ADD COLUMN IF NOT EXISTS out_for_delivery_at  timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_assigned_to   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Proof of delivery (photo required, signature optional — founder choice)
  ADD COLUMN IF NOT EXISTS pod_photo_urls       text[],
  ADD COLUMN IF NOT EXISTS pod_signature_b64    text,
  -- Delivery location (Task #89 — drop-pin / directions at checkout)
  ADD COLUMN IF NOT EXISTS delivery_lat         numeric(10,6),
  ADD COLUMN IF NOT EXISTS delivery_lng         numeric(10,6),
  ADD COLUMN IF NOT EXISTS delivery_directions  text;

COMMENT ON COLUMN public.orders.fulfillment_status IS
  'Online delivery lifecycle: placed → preparing → collected → in_transit → out_for_delivery → delivered (or cancelled). NULL for POS sales (no delivery). Validated app-side by lib/order-status.ts.';
COMMENT ON COLUMN public.orders.driver_assigned_to IS
  'profiles.id of the driver assigned to deliver this order. Set at the pickup-queue / driver-assignment step.';
COMMENT ON COLUMN public.orders.pod_photo_urls IS
  'Proof-of-delivery photos (site-images bucket URLs). At least one REQUIRED before fulfillment_status can move to delivered (enforced app-side).';

-- Indexes for the driver dashboard + ops queries
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status
  ON public.orders (fulfillment_status)
  WHERE fulfillment_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_driver_assigned
  ON public.orders (driver_assigned_to, fulfillment_status)
  WHERE driver_assigned_to IS NOT NULL;

-- Backfill: any existing online_market order with a paid status that
-- predates this migration → mark 'delivered' (they're historical/done,
-- don't want them cluttering the driver queue as if pending).
UPDATE public.orders
SET fulfillment_status = 'delivered',
    delivered_at = COALESCE(delivered_at, created_at)
WHERE order_type = 'online_market'
  AND fulfillment_status IS NULL
  AND payment_status IN ('paid', 'paid_in_full');

-- Verify
DO $pf$
DECLARE
  col_count int;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders'
    AND column_name IN (
      'fulfillment_status','preparing_at','collected_at','collected_by',
      'in_transit_at','out_for_delivery_at','delivered_at','delivered_by',
      'driver_assigned_to','pod_photo_urls','pod_signature_b64',
      'delivery_lat','delivery_lng','delivery_directions'
    );
  IF col_count < 14 THEN
    RAISE EXCEPTION 'Migration incomplete: only % of 14 columns present', col_count;
  END IF;
  RAISE NOTICE '✅ Order fulfillment lifecycle: all 14 columns added';
END $pf$;

COMMIT;
