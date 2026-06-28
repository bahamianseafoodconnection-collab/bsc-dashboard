-- ============================================================================
-- PACKAGE 3 — Payment terminal integration, SAFE SUBSET migration (run 2026-06-28).
-- Adds the approval-status gate columns + the webhook audit table. DEFAULT
-- 'approved' so it gates nothing yet (no risk to live POS/online flows); the
-- per-flow gating (online/phone → 'pending' until confirmed) is wired separately
-- with review, alongside webhook signature validation (blocked on Julian/RBC).
-- ============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_approval_status text NOT NULL DEFAULT 'approved'
  CHECK (payment_approval_status IN ('pending','approved','declined','manual_override'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_webhook_received_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id text,
  source text NOT NULL CHECK (source IN ('rbc_terminal','plug_n_pay')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  raw_payload jsonb, status text, signature_valid boolean,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order ON public.payment_webhooks(order_id);
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;
-- Service-role only (founder APIs); no public policies.
