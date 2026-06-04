-- 20260604020000_points_per_10_profit_trigger.sql
--
-- 4 customer reward points generated for every $10 of net profit BSC
-- makes on an order. Founder direction 2026-06-04.
--
-- Trigger fires when an order becomes "completed" from the customer's
-- perspective:
--   • POS sale: INSERT with payment_status='paid_in_full' (no delivery
--     stage — they walked out with goods).
--   • Online delivery: UPDATE that flips fulfillment_status to
--     'delivered' (proof of delivery captured).
--
-- Formula: points_awarded = floor(net_profit / 10) * 4
-- Anti-dupe: customer_points_log.order_id UNIQUE so re-triggering on a
-- second UPDATE never re-awards. Soft-fail on conflict.

-- Step 1: ensure the points log has an order_id uniqueness constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_points_log'::regclass
      AND contype = 'u'
      AND conname = 'customer_points_log_order_id_earn_uniq'
  ) THEN
    -- Only ONE earn row per order. Manual adjustments (no order_id) can repeat.
    CREATE UNIQUE INDEX IF NOT EXISTS customer_points_log_order_id_earn_uniq
      ON public.customer_points_log (order_id)
      WHERE order_id IS NOT NULL AND reason = 'earn';
  END IF;
END $$;

-- Step 2: function that does the awarding.
CREATE OR REPLACE FUNCTION public.bsc_award_points_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profit  NUMERIC;
  v_points  INTEGER;
  v_skip    BOOLEAN := false;
BEGIN
  -- Must have a customer to award to.
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;

  -- Walk-in anonymous singleton — skip.
  IF NEW.customer_id = '00000000-0000-0000-0000-000000000001'::uuid THEN RETURN NEW; END IF;

  -- Profit basis.
  v_profit := COALESCE(NEW.net_profit, 0);
  IF v_profit < 10 THEN RETURN NEW; END IF;

  -- 4 points per full $10 of profit.
  v_points := floor(v_profit / 10)::int * 4;
  IF v_points <= 0 THEN RETURN NEW; END IF;

  -- Insert earn row + bump balance. ON CONFLICT keeps it idempotent if the
  -- trigger fires twice (e.g., status flips back and forth).
  BEGIN
    INSERT INTO public.customer_points_log (customer_id, delta, reason, note, order_id, profit_basis)
    VALUES (NEW.customer_id, v_points, 'earn',
            '4 pts per $10 profit · order ' || substring(NEW.id::text from 1 for 8),
            NEW.id, v_profit);
  EXCEPTION WHEN unique_violation THEN
    v_skip := true;
  END;

  IF NOT v_skip THEN
    UPDATE public.customers
       SET points_balance  = COALESCE(points_balance, 0)  + v_points,
           points_lifetime = COALESCE(points_lifetime, 0) + v_points,
           updated_at      = NOW()
     WHERE id = NEW.customer_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: triggers — one for POS-style INSERT, one for delivery UPDATE.
DROP TRIGGER IF EXISTS trg_award_points_on_pos_insert ON public.orders;
CREATE TRIGGER trg_award_points_on_pos_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid_in_full' AND NEW.fulfillment_status IS NULL)
  EXECUTE FUNCTION public.bsc_award_points_for_order();

DROP TRIGGER IF EXISTS trg_award_points_on_delivered ON public.orders;
CREATE TRIGGER trg_award_points_on_delivered
  AFTER UPDATE OF fulfillment_status ON public.orders
  FOR EACH ROW
  WHEN (NEW.fulfillment_status = 'delivered' AND (OLD.fulfillment_status IS DISTINCT FROM 'delivered'))
  EXECUTE FUNCTION public.bsc_award_points_for_order();

DO $$
BEGIN
  RAISE NOTICE '✅ Points-per-profit rule live: 4 pts per $10 of order.net_profit, awarded on POS paid-in-full INSERT or fulfillment delivered. Idempotent via unique index on (order_id) WHERE reason=earn.';
END $$;
