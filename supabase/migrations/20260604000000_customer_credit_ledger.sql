-- 20260604000000_customer_credit_ledger.sql
--
-- Customer credit ledger — append-only history of every change to
-- customers.current_balance. Lets the founder see WHY a customer's
-- balance is $X and reconcile when a payment posts.
--
-- delta > 0: balance went up (new charge / credit purchase / adjustment up)
-- delta < 0: balance went down (payment received / refund / adjustment down)
--
-- The 'record_credit_change' admin action in /api/customers/admin INSERTs
-- a row here AND updates customers.current_balance in the same call. The
-- ledger insert is soft-fail in the API so the balance update lands even
-- if this migration is somehow missing in prod — but with this migration
-- applied, every change gets a row.

CREATE TABLE IF NOT EXISTS public.customer_credit_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  delta         NUMERIC(12,2) NOT NULL CHECK (delta <> 0),
  reason        TEXT NOT NULL DEFAULT 'manual',
  note          TEXT,
  balance_after NUMERIC(12,2) NOT NULL,
  order_id      UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_customer
  ON public.customer_credit_ledger (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_order
  ON public.customer_credit_ledger (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Founder + co_founder + manager can read everything; cashier can read
-- ONLY their own customer's rows (via orders.created_by linkage if needed).
-- For now, lock writes to service-role only (API uses it) and reads to staff.
DROP POLICY IF EXISTS p_credit_ledger_staff_read ON public.customer_credit_ledger;
CREATE POLICY p_credit_ledger_staff_read ON public.customer_credit_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role::text IN ('founder','co_founder','manager','control_admin','basic_admin','cashier')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.customer_credit_ledger FROM PUBLIC, anon, authenticated;
GRANT  SELECT                          ON public.customer_credit_ledger TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ customer_credit_ledger created + RLS locked. Service-role writes only.';
END $$;
