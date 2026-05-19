-- =====================================================================
-- BSC Migration: 20260519030000_ar_payment_received.sql
--
-- Three columns on `orders` to record WHEN, WHO, and HOW an account
-- (wholesale credit) order was paid off. Used by /dashboard/ar-aging
-- to show clean cash-collected history and clear unpaid balances.
-- =====================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_received_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_received_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_received_method  TEXT CHECK (
    payment_received_method IS NULL OR
    payment_received_method IN ('cash','card','wire','check','offset')
  ),
  ADD COLUMN IF NOT EXISTS payment_received_notes   TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_unpaid_account
  ON orders (created_at DESC)
  WHERE payment_method = 'account' AND payment_status = 'unpaid';

-- View: every unpaid account order with its age in days. Drives the
-- aging dashboard + lets AR scripts grep by bucket.
CREATE OR REPLACE VIEW ar_unpaid_orders AS
SELECT
  o.id,
  o.created_at,
  o.total,
  o.customer_id,
  o.customer_name,
  o.customer_phone,
  o.channel,
  o.location,
  o.cashier_user_id,
  EXTRACT(DAY FROM (NOW() - o.created_at))::INTEGER AS age_days,
  CASE
    WHEN o.created_at > NOW() - INTERVAL '30 days' THEN '0-30'
    WHEN o.created_at > NOW() - INTERVAL '60 days' THEN '31-60'
    WHEN o.created_at > NOW() - INTERVAL '90 days' THEN '61-90'
    ELSE '90+'
  END AS bucket
FROM orders o
WHERE o.payment_method = 'account'
  AND o.payment_status = 'unpaid'
  AND o.status = 'completed';

GRANT SELECT ON ar_unpaid_orders TO authenticated;

-- Mark-paid RPC. Admin-only. Stamps payment_received_* and flips
-- payment_status. Returns the updated row.
CREATE OR REPLACE FUNCTION mark_account_order_paid(
  p_order_id  UUID,
  p_method    TEXT,
  p_notes     TEXT DEFAULT NULL
) RETURNS orders
LANGUAGE plpgsql AS $$
DECLARE v_order orders;
BEGIN
  IF NOT (is_bsc_admin() OR is_bsc_qc_staff()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_method NOT IN ('cash','card','wire','check','offset') THEN
    RAISE EXCEPTION 'method must be cash|card|wire|check|offset';
  END IF;

  UPDATE orders SET
    payment_status          = 'paid_in_full',
    payment_received_at     = NOW(),
    payment_received_by     = auth.uid(),
    payment_received_method = p_method,
    payment_received_notes  = p_notes
  WHERE id = p_order_id
    AND payment_method = 'account'
    AND payment_status = 'unpaid'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found or not an unpaid account order', p_order_id;
  END IF;
  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_account_order_paid(UUID, TEXT, TEXT) TO authenticated;

COMMIT;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('payment_received_at','payment_received_by','payment_received_method','payment_received_notes')
ORDER BY column_name;

SELECT 'ar_unpaid_orders count:' AS check, COUNT(*) AS n FROM ar_unpaid_orders;
