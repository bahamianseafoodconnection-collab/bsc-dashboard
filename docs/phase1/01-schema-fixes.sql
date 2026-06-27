-- ============================================================================
-- BSC MARKETPLACE PHASE 1 — SCHEMA FIXES (locked 2026-06-27, rev 2)
-- Order: RUN 1 (enum, ALONE first) → RUN 2 (structure + pricing). A new enum
-- value can't be added AND used in the same transaction, hence two runs.
-- VAT confirmed 2026-06-27: 14% markup + VAT on top (no 7%); vat_pct=0 today.
-- Revisions vs rev1: dynamic per-lot yield (no hardcoded 6%); business_accounts
-- uses assigned_tier + status; product_type also on the products catalog.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- RUN 1 — add the 4 commercial tiers to pricing_channel_v2 (run ALONE first)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_restaurant';
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_hotel';
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_distributor';
ALTER TYPE public.pricing_channel_v2 ADD VALUE IF NOT EXISTS 'commercial_vip';


-- ─────────────────────────────────────────────────────────────────────────
-- RUN 2 — business accounts + conch quota + product_type + commercial pricing
-- rows (run AFTER RUN 1 has committed the enum values).
-- ─────────────────────────────────────────────────────────────────────────

-- FIX 2: business accounts (commercial + international) + delivery addresses.
CREATE TABLE IF NOT EXISTS public.business_accounts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_e164              text,                                  -- link to customers by phone
  username                text NOT NULL UNIQUE,                  -- marketplace login = this username
  auth_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_type              text NOT NULL DEFAULT 'commercial'
                            CHECK (buyer_type IN ('commercial','international')),
  assigned_tier           text NOT NULL
                            CHECK (assigned_tier IN ('commercial_restaurant','commercial_hotel','commercial_distributor','commercial_vip')),
  company_name            text,
  business_license_number text,
  vat_number              text,
  company_registration    text,
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','suspended','closed')),
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
-- Writes go through service-role founder/staff APIs (bypass RLS).

-- FIX 3: conch product_type on BOTH the catalog (distinct raw/finished SKUs) and
-- the Spiny Tail lot ledger; quota tracking with DYNAMIC per-lot yield.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text
  CHECK (product_type IS NULL OR product_type IN ('raw_domestic','raw_export','finished_export'));

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
  -- DYNAMIC yield: actual finished ÷ raw per lot. NOT a fixed 6%. NULL until the
  -- finished weight is recorded.
  calculated_yield       numeric GENERATED ALWAYS AS (
                           CASE WHEN raw_weight_input > 0 AND finished_weight_output IS NOT NULL
                                THEN ROUND(finished_weight_output / raw_weight_input, 4)
                                ELSE NULL END) STORED,
  -- Export types consume the CITES ceiling; domestic can be set false.
  counts_against_quota   boolean NOT NULL DEFAULT true,
  -- FOUNDER/CO_FOUNDER ONLY (may name Igloo Express). Never exposed to customers.
  sale_destination       text,
  recorded_at            date NOT NULL DEFAULT current_date,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quota_lot  ON public.quota_tracking(lot_id);
CREATE INDEX IF NOT EXISTS idx_quota_date ON public.quota_tracking(recorded_at);

CREATE TABLE IF NOT EXISTS public.conch_quota_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  annual_ceiling_lbs numeric NOT NULL DEFAULT 130000,   -- finished-weight CITES ceiling
  quota_year         int     NOT NULL DEFAULT 2026,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.conch_quota_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Live remaining quota — subtract ACTUAL finished weight (dynamic), no
-- destination exposed (aggregate only).
CREATE OR REPLACE VIEW public.conch_quota_remaining AS
SELECT
  c.quota_year,
  c.annual_ceiling_lbs,
  COALESCE(SUM(q.finished_weight_output) FILTER (
    WHERE q.counts_against_quota AND q.finished_weight_output IS NOT NULL), 0) AS used_finished_lbs,
  c.annual_ceiling_lbs - COALESCE(SUM(q.finished_weight_output) FILTER (
    WHERE q.counts_against_quota AND q.finished_weight_output IS NOT NULL), 0) AS remaining_lbs
FROM public.conch_quota_config c
LEFT JOIN public.quota_tracking q
  ON q.counts_against_quota
 AND EXTRACT(YEAR FROM q.recorded_at)::int = c.quota_year
GROUP BY c.quota_year, c.annual_ceiling_lbs;

-- quota_tracking is FOUNDER-ONLY (Igloo Express confidentiality): RLS on, no
-- public policies → only the service role (founder/co_founder APIs) read/write.
ALTER TABLE public.quota_tracking ENABLE ROW LEVEL SECURITY;


-- FIX 1: commercial pricing rules. CONFIRMED 2026-06-27 — "14% markup + VAT on
-- top, no 7% overhead" → price = cost × 1.14 × (1+VAT). VAT disabled today, so
-- vat_pct = 0 → price = cost × 1.14. WHEN VAT IS RE-ENABLED: update these 4 rows'
-- vat_pct to the live VAT rate (commercial VAT stacks on top of the 14%).
INSERT INTO public.pricing_rules (channel, markup_pct, vat_pct, description)
SELECT v.channel::public.pricing_channel_v2, 14, 0, v.descr
FROM (VALUES
  ('commercial_restaurant',  'Restaurant Wholesale — 14% markup on supplier cost (+VAT on top when enabled)'),
  ('commercial_hotel',       'Hotel Wholesale — 14% markup on supplier cost (+VAT on top when enabled)'),
  ('commercial_distributor', 'Distributor — 14% markup on supplier cost (+VAT on top when enabled)'),
  ('commercial_vip',         'VIP — 14% markup on supplier cost (+VAT on top when enabled)')
) AS v(channel, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_rules r WHERE r.channel::text = v.channel);
