-- ============================================================================
-- BSC MARKETPLACE PHASE 1 — SCHEMA FIXES (locked 2026-06-27)
-- Run RUN 1 first (enum additions commit), THEN RUN 2 (everything else).
-- A new enum value cannot be added AND used in the same transaction.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- RUN 1 — add the 4 commercial tiers to the pricing_channel_v2 enum (alone)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_restaurant';
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_hotel';
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_distributor';
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_vip';


-- ─────────────────────────────────────────────────────────────────────────
-- RUN 2 — pricing rules + business accounts + conch quota (run after RUN 1)
-- ─────────────────────────────────────────────────────────────────────────

-- FIX 1: commercial pricing rules @ 14% margin, 0% VAT (VAT disabled).
-- bsc_calculate_price(cost, 'commercial_*', qty, unit) → cost * 1.14.
INSERT INTO public.pricing_rules (channel, markup_pct, vat_pct, description)
SELECT v.channel::public.pricing_channel_v2, 14, 0, v.descr
FROM (VALUES
  ('commercial_restaurant',  'Restaurant Wholesale — 14% on supplier cost'),
  ('commercial_hotel',       'Hotel Wholesale — 14% on supplier cost'),
  ('commercial_distributor', 'Distributor — 14% on supplier cost'),
  ('commercial_vip',         'VIP — 14% on supplier cost')
) AS v(channel, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_rules r WHERE r.channel::text = v.channel);

-- FIX 2: business accounts (commercial + international buyers) + delivery addrs.
-- pricing_tier maps 1:1 to a commercial_* pricing_channel_v2 value.
CREATE TABLE IF NOT EXISTS public.business_accounts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_e164              text,
  username                text NOT NULL UNIQUE,
  auth_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_type              text NOT NULL DEFAULT 'commercial'
                            CHECK (buyer_type IN ('commercial','international')),
  pricing_tier            text NOT NULL
                            CHECK (pricing_tier IN ('commercial_restaurant','commercial_hotel','commercial_distributor','commercial_vip')),
  company_name            text,
  business_license_number text,
  vat_number              text,
  company_registration    text,
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_accounts_phone ON public.business_accounts(phone_e164);
CREATE INDEX IF NOT EXISTS idx_business_accounts_auth  ON public.business_accounts(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_business_accounts_uname ON public.business_accounts(lower(username));

CREATE TABLE IF NOT EXISTS public.business_delivery_addresses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  address             text NOT NULL,
  contact_person      text,
  phone               text,
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bda_account ON public.business_delivery_addresses(business_account_id);

ALTER TABLE public.business_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_delivery_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ba_owner_select ON public.business_accounts;
CREATE POLICY ba_owner_select ON public.business_accounts
  FOR SELECT USING (auth_user_id = auth.uid());
DROP POLICY IF EXISTS bda_owner_select ON public.business_delivery_addresses;
CREATE POLICY bda_owner_select ON public.business_delivery_addresses
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.business_accounts b
    WHERE b.id = business_delivery_addresses.business_account_id
      AND b.auth_user_id = auth.uid()));
-- All writes go through service-role founder/staff APIs (bypass RLS).

-- FIX 3: Spiny Tail conch quota tracking (processing ledger).
ALTER TABLE public.spinytails_lots
  ADD COLUMN IF NOT EXISTS product_type text
  CHECK (product_type IS NULL OR product_type IN ('raw_domestic','raw_export','finished_export'));

CREATE TABLE IF NOT EXISTS public.quota_tracking (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                 uuid REFERENCES public.spinytails_lots(id) ON DELETE SET NULL,
  lot_code               text,
  product_type           text NOT NULL
                           CHECK (product_type IN ('raw_domestic','raw_export','finished_export')),
  raw_weight_input       numeric NOT NULL DEFAULT 0,
  finished_weight_output numeric,
  -- 6% processing loss: finished equivalent = raw * 0.94 (unless an exact
  -- finished weight is recorded). STORED so the quota view stays cheap.
  finished_equivalent    numeric GENERATED ALWAYS AS
                           (COALESCE(finished_weight_output, ROUND(raw_weight_input * 0.94, 2))) STORED,
  -- Export types count against the 130k ceiling; domestic can be set false.
  counts_against_quota   boolean NOT NULL DEFAULT true,
  -- FOUNDER-ONLY (may name Igloo Express). Never exposed to any customer view.
  sale_destination       text,
  recorded_at            date NOT NULL DEFAULT current_date,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quota_lot  ON public.quota_tracking(lot_id);
CREATE INDEX IF NOT EXISTS idx_quota_date ON public.quota_tracking(recorded_at);

CREATE TABLE IF NOT EXISTS public.conch_quota_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  annual_ceiling_lbs numeric NOT NULL DEFAULT 130000,
  quota_year         int     NOT NULL DEFAULT 2026,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.conch_quota_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Live remaining quota — aggregate only, no destination exposed.
CREATE OR REPLACE VIEW public.conch_quota_remaining AS
SELECT
  c.quota_year,
  c.annual_ceiling_lbs,
  COALESCE(SUM(q.finished_equivalent) FILTER (WHERE q.counts_against_quota), 0) AS used_lbs,
  c.annual_ceiling_lbs
    - COALESCE(SUM(q.finished_equivalent) FILTER (WHERE q.counts_against_quota), 0) AS remaining_lbs
FROM public.conch_quota_config c
LEFT JOIN public.quota_tracking q
  ON q.counts_against_quota
 AND EXTRACT(YEAR FROM q.recorded_at)::int = c.quota_year
GROUP BY c.quota_year, c.annual_ceiling_lbs;

-- quota_tracking is FOUNDER-ONLY (Igloo Express confidentiality): RLS on, no
-- public policies → only the service role (founder APIs) can read/write it.
ALTER TABLE public.quota_tracking ENABLE ROW LEVEL SECURITY;
