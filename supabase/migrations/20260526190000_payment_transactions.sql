-- =====================================================================
-- BSC Migration: 20260526190000_payment_transactions.sql
--
-- Audit table for every Plug'n Pay (RBC) card transaction attempt — from
-- the moment the customer clicks "Pay with Card" on /checkout through
-- the return-redirect verification. Logs successes, declines, fraud-flag
-- responses, and gateway errors alike. Drives:
--   - Customer receipt rendering
--   - Daily reconciliation against RBC settlement reports
--   - Founder AI awareness of payment health
--   - Fraud / chargeback investigation
--
-- NO CARD DATA EVER LANDS HERE. The PCI-protected fields (PAN, CVV, full
-- expiry, magstripe, EMV) never enter our system at all because the
-- Smart Screens v2 hosted page collects them on pay1.plugnpay.com. The
-- only card-related fields we ever store are:
--   - pt_authorization_code (alphanumeric, 6 chars max — public reference)
--   - last 4 (if echoed back by PnP — see column note)
--   - card brand (Visa / Mastercard — echoed back)
-- Per PCI-DSS guidance + founder spec ("BSC never stores raw card number,
-- CVV, or expiry") + the saved feedback_rbc_credential_handling rule.
--
-- Schema notes:
--   - One row per ATTEMPT (success or fail). Multiple rows can point at
--     the same order_id when a customer retries after a decline.
--   - raw_submission / raw_response are JSONB so we can replay or audit
--     without re-parsing field by field later.
--   - hash_verified + query_verified are the two-factor PASS gate before
--     orders.payment_status flips to 'paid'.
--   - outcome_bucket mirrors lib/plugnpay/rbc-codes.ts so dashboards can
--     filter without re-mapping.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  order_id                        uuid          REFERENCES public.orders(id)    ON DELETE SET NULL,
  customer_id                     uuid          REFERENCES public.customers(id) ON DELETE SET NULL,

  -- Attempt tracking
  attempted_at                    timestamptz   NOT NULL DEFAULT now(),
  finalized_at                    timestamptz,

  -- What we SUBMITTED to PnP (pt_* = "passed through" fields, per docs)
  pt_gateway_account              text,
  pt_transaction_amount           numeric(12,2),
  pt_currency                     text          DEFAULT 'BSD',
  pt_client_orderid               text,         -- our order id, echoed by PnP

  -- What PnP REPLIED with on the return redirect (pi_* + pt_* fields)
  pi_response_status              text,         -- success | badcard | problem | fraud
  pi_response_code                text,         -- RBC code: '00', '51', '34', etc.
  pi_error_message                text,
  pi_duplicate_transaction        boolean       DEFAULT false,
  pt_order_id                     text,         -- PnP-side order ID (NOT ours)
  pt_authorization_code           text,         -- 6-char auth code (public reference, OK to store)
  pt_transaction_response_hash    text,         -- SHA256 PnP sent — preserved for forensic replay

  -- Card metadata that PnP echoes (non-PCI — brand + last4 only)
  card_brand                      text,         -- 'Visa' | 'Mastercard' | etc.
  card_last4                      text,         -- last 4 digits — NOT the full PAN

  -- AVS / CVV match codes (used for fraud screening, not PCI)
  avs_code                        text,         -- single letter per processor
  cvv_code                        text,         -- M (match) / N (no match) / etc.

  -- Verification gates — both MUST be true before order.payment_status = 'paid'
  hash_verified                   boolean       NOT NULL DEFAULT false,
  query_verified                  boolean       NOT NULL DEFAULT false,

  -- Customer-facing outcome (mapped via lib/plugnpay/rbc-codes.ts)
  customer_message                text,         -- ready to surface as-is
  outcome_bucket                  text          CHECK (outcome_bucket IN (
                                                  'approved','declined','fraud','retry','contact','unknown'
                                                )),

  -- Full audit blobs — replay-able without re-parsing later
  raw_submission                  jsonb,        -- whatever we POSTed (no card data — Smart Screens v2 form fields only)
  raw_response                    jsonb,        -- whatever PnP redirected back to us

  -- Request metadata
  client_ip                       text,
  user_agent                      text,
  created_by                      uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                      timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.payment_transactions          IS 'Plug''n Pay / RBC card transaction attempt log. NO CARD DATA — brand + last4 only.';
COMMENT ON COLUMN public.payment_transactions.pt_client_orderid IS 'OUR order id, echoed by PnP via pt_client_orderid submission field.';
COMMENT ON COLUMN public.payment_transactions.pt_order_id       IS 'PnP-side order id — the one we use for server-side Query Transaction verification.';
COMMENT ON COLUMN public.payment_transactions.hash_verified     IS 'Did SHA256(secret + publisher + pt_order_id + pt_transaction_amount) match the resphash PnP sent? Mandatory before marking paid.';
COMMENT ON COLUMN public.payment_transactions.query_verified    IS 'Did server-side Remote API Query Transaction confirm pi_response_status=success? Belt-and-suspenders second factor — mandatory before marking paid.';
COMMENT ON COLUMN public.payment_transactions.outcome_bucket    IS 'Mirrors lib/plugnpay/rbc-codes.ts buckets — used for dashboard filtering + reconciliation grouping.';

-- Indexes -------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id
  ON public.payment_transactions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_tx_attempted_at
  ON public.payment_transactions (attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_tx_pt_order_id
  ON public.payment_transactions (pt_order_id)
  WHERE pt_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_tx_outcome
  ON public.payment_transactions (outcome_bucket, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_tx_customer_id
  ON public.payment_transactions (customer_id, attempted_at DESC)
  WHERE customer_id IS NOT NULL;

-- RLS -----------------------------------------------------------------
--
-- Reads:
--   - Customer can see their own attempts (via JOIN to customers.auth_user_id).
--   - Founder / co_founder / control_admin / basic_admin see everything.
-- Writes:
--   - NEVER via direct DB. All writes funnel through the service-role
--     API routes /api/payment/start + /api/payment/return/*. No GRANT
--     INSERT for `authenticated` role. RLS enforces this — the table
--     has SELECT policies only, so any client INSERT is rejected.

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_payment_tx_customer_own ON public.payment_transactions;
CREATE POLICY p_payment_tx_customer_own
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM public.customers c
      WHERE c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS p_payment_tx_admin_all ON public.payment_transactions;
CREATE POLICY p_payment_tx_admin_all
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin','basic_admin')
    )
  );

-- Grants --------------------------------------------------------------
-- SELECT only for authenticated; service_role bypasses RLS for writes.
GRANT SELECT ON public.payment_transactions TO authenticated;

COMMIT;
