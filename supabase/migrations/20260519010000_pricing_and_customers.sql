-- =====================================================================
-- BSC Migration: 20260519010000_pricing_and_customers.sql
--
-- Two halves — both safe to run on an in-flight database:
--   1) PRICING STRUCTURE — five-channel markup rules with VAT, audit
--      trail, and the canonical bsc_calculate_price() function. New
--      objects, no overlap with existing pricing code.
--   2) CUSTOMERS UNIFICATION (additive merge) — keeps the production
--      `customers` table as-is and ADDS columns/indexes/functions to
--      unify phone-first lookup across Nassau POS, Andros POS, Online.
--
-- Differences vs. the originally-drafted bundle (intentional):
--   • Every REFERENCES users(id) swapped to REFERENCES auth.users(id)
--     (this project has no public.users table).
--   • RLS uses the existing is_bsc_admin() / is_bsc_qc_staff() helpers
--     plus an explicit allowlist for cashier/andros_staff — so founder
--     and co_founder retain access (they'd be locked out by the original
--     role list).
--   • The customers section is additive — no CREATE TABLE that would
--     silently skip the production table, no CHECK constraints that
--     could fail against legacy NULL emails. Strict validation lives
--     inside the bsc_upsert_customer() function instead.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 1: PRICING STRUCTURE
-- ─────────────────────────────────────────────────────────────────────

-- 1.1 Channel + unit enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_channel_v2') THEN
    CREATE TYPE pricing_channel_v2 AS ENUM (
      'wholesale_in_store',  -- 22% (Nassau + Andros POS qualified)
      'wholesale_online',    -- 19% (online qualified)
      'online_retail',       -- 35%
      'nassau_pos',          -- 40% unless qualified as wholesale
      'andros_pos'           -- 40% unless qualified as wholesale
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_unit') THEN
    CREATE TYPE sale_unit AS ENUM ('lb','case','bag','portion','each');
  END IF;
END$$;

-- 1.2 Active markup rules
CREATE TABLE IF NOT EXISTS pricing_rules (
  channel        pricing_channel_v2 PRIMARY KEY,
  markup_pct     NUMERIC(5,2) NOT NULL,
  vat_pct        NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  description    TEXT         NOT NULL,
  effective_from TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by     UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO pricing_rules (channel, markup_pct, vat_pct, description) VALUES
  ('wholesale_in_store', 22.00, 10.00, 'In-store wholesale: 10+ lbs of one product OR by the case, at Nassau or Andros POS'),
  ('wholesale_online',   19.00, 10.00, 'Online wholesale: 10+ lbs of one product OR by the case, online store'),
  ('online_retail',      35.00, 10.00, 'Online retail: under 10 lbs, per bag, or per portion'),
  ('nassau_pos',         40.00, 10.00, 'Nassau POS retail, unless qualifies as in-store wholesale'),
  ('andros_pos',         40.00, 10.00, 'Andros POS retail, unless qualifies as in-store wholesale')
ON CONFLICT (channel) DO UPDATE
  SET markup_pct  = EXCLUDED.markup_pct,
      vat_pct     = EXCLUDED.vat_pct,
      description = EXCLUDED.description,
      updated_at  = NOW();

-- 1.3 Wholesale qualification config
CREATE TABLE IF NOT EXISTS pricing_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  notes TEXT
);

INSERT INTO pricing_config (key, value, notes) VALUES
  ('wholesale_min_lbs',  '10',   'Minimum pounds of ONE product (per line item) to qualify as wholesale'),
  ('wholesale_case_flag','true', 'Anything sold by the case is wholesale regardless of weight')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, notes = EXCLUDED.notes;

-- 1.4 Canonical pricing function (mirror of lib/pricing.ts)
CREATE OR REPLACE FUNCTION bsc_calculate_price(
  p_cost              NUMERIC,
  p_requested_channel pricing_channel_v2,
  p_quantity          NUMERIC,
  p_unit              sale_unit
)
RETURNS TABLE (
  effective_channel     pricing_channel_v2,
  markup_pct            NUMERIC,
  subtotal              NUMERIC,
  vat_amount            NUMERIC,
  final_price           NUMERIC,
  upgraded_to_wholesale BOOLEAN
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_min_lbs    NUMERIC;
  v_case_flag  BOOLEAN;
  v_channel    pricing_channel_v2 := p_requested_channel;
  v_markup     NUMERIC;
  v_vat_pct    NUMERIC;
  v_upgraded   BOOLEAN := FALSE;
  v_subtotal   NUMERIC;
  v_vat        NUMERIC;
  v_qualifies  BOOLEAN;
BEGIN
  SELECT value::NUMERIC INTO v_min_lbs    FROM pricing_config WHERE key = 'wholesale_min_lbs';
  SELECT value::BOOLEAN INTO v_case_flag  FROM pricing_config WHERE key = 'wholesale_case_flag';

  v_qualifies :=
       (p_unit = 'lb'   AND p_quantity >= v_min_lbs)
    OR (v_case_flag AND p_unit = 'case');

  IF v_qualifies THEN
    IF v_channel IN ('nassau_pos','andros_pos') THEN
      v_channel  := 'wholesale_in_store'; v_upgraded := TRUE;
    ELSIF v_channel = 'online_retail' THEN
      v_channel  := 'wholesale_online';   v_upgraded := TRUE;
    END IF;
  END IF;

  SELECT markup_pct, vat_pct INTO v_markup, v_vat_pct
  FROM pricing_rules WHERE channel = v_channel;

  IF v_markup IS NULL THEN
    RAISE EXCEPTION 'No pricing rule found for channel %', v_channel;
  END IF;

  v_subtotal := ROUND(p_cost * (1 + v_markup / 100.0), 2);
  v_vat      := ROUND(v_subtotal * (v_vat_pct / 100.0), 2);

  effective_channel     := v_channel;
  markup_pct            := v_markup;
  subtotal              := v_subtotal;
  vat_amount            := v_vat;
  final_price           := v_subtotal + v_vat;
  upgraded_to_wholesale := v_upgraded;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION bsc_calculate_price IS
  'BSC canonical pricing function. Qualified POS → wholesale_in_store 22%. Qualified online → wholesale_online 19%. 10% VAT on top.';

GRANT EXECUTE ON FUNCTION bsc_calculate_price(NUMERIC, pricing_channel_v2, NUMERIC, sale_unit) TO authenticated, anon;

-- 1.5 Audit trail
CREATE TABLE IF NOT EXISTS pricing_rules_audit (
  id              BIGSERIAL PRIMARY KEY,
  channel         pricing_channel_v2 NOT NULL,
  old_markup_pct  NUMERIC(5,2),
  new_markup_pct  NUMERIC(5,2),
  old_vat_pct     NUMERIC(5,2),
  new_vat_pct     NUMERIC(5,2),
  changed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operation       TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION pricing_rules_audit_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pricing_rules_audit (channel, new_markup_pct, new_vat_pct, operation, changed_by)
    VALUES (NEW.channel, NEW.markup_pct, NEW.vat_pct, 'INSERT', auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO pricing_rules_audit (channel, old_markup_pct, new_markup_pct, old_vat_pct, new_vat_pct, operation, changed_by)
    VALUES (NEW.channel, OLD.markup_pct, NEW.markup_pct, OLD.vat_pct, NEW.vat_pct, 'UPDATE', auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO pricing_rules_audit (channel, old_markup_pct, old_vat_pct, operation, changed_by)
    VALUES (OLD.channel, OLD.markup_pct, OLD.vat_pct, 'DELETE', auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_rules_audit ON pricing_rules;
CREATE TRIGGER trg_pricing_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION pricing_rules_audit_trg();

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 2: CUSTOMERS UNIFICATION (additive merge)
-- ─────────────────────────────────────────────────────────────────────
--
-- Production already has a `customers` table queried by /app/customers,
-- /app/pulse, /app/dashboard, /app/pos and /api/customers/upsert. We
-- ADD the new fields beside the existing ones so nothing in production
-- breaks. Strict required-field validation moves into the upsert
-- function (it enforces phone + name + email at write-time) instead of
-- a CHECK constraint that would reject legacy rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_origin_channel') THEN
    CREATE TYPE customer_origin_channel AS ENUM (
      'nassau_pos','andros_pos','online','qr_scan','wholesale','walk_in_anonymous','imported'
    );
  END IF;
END$$;

-- ── First, defensively ensure all the "core" legacy columns the upsert
-- function + backfill assume exist actually exist. Different deployments
-- of the customers table have evolved different shapes (some have name,
-- some full_name; some have last_seen_at, some don't). Adding with IF
-- NOT EXISTS is a no-op when present.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS full_name      TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS first_seen_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- Backfill last_seen_at on legacy rows so ORDER BY in the phone backfill
-- below doesn't choke.
UPDATE customers
  SET last_seen_at = COALESCE(updated_at, created_at, NOW())
  WHERE last_seen_at IS NULL;

-- If a `name` column existed historically, copy it into full_name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'customers' AND column_name = 'name')
  THEN
    EXECUTE 'UPDATE customers SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL';
  END IF;
END$$;

-- Now add the new unified-customer columns.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_e164             TEXT,
  ADD COLUMN IF NOT EXISTS phone_raw              TEXT,
  ADD COLUMN IF NOT EXISTS phone_country          TEXT,
  ADD COLUMN IF NOT EXISTS is_walk_in_anonymous   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS origin_channel         customer_origin_channel,
  ADD COLUMN IF NOT EXISTS qr_source              TEXT,
  ADD COLUMN IF NOT EXISTS is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes                  TEXT,
  ADD COLUMN IF NOT EXISTS created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Phone shape check applies only to E.164 values — legacy `phone` is
-- untouched. NOT VALID skips the existing-row scan; new writes are
-- enforced via the upsert function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_phone_e164_shape_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_phone_e164_shape_check
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_e164
  ON customers (phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_email_lower
  ON customers (lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm
  ON customers USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_last_seen
  ON customers (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_qr_source
  ON customers (qr_source) WHERE qr_source IS NOT NULL;

-- 2.1 Phone normalizer
--   7 digits  → +1242 (Bahamian local)
--   10 digits → +1 (NANP)
--   11 digits starting with 1 → +1xxxxxxxxxx
--   else: prepend +
CREATE OR REPLACE FUNCTION bsc_normalize_phone(p_raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_digits TEXT;
BEGIN
  IF p_raw IS NULL OR length(trim(p_raw)) = 0 THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  IF substring(v_digits FROM 1 FOR 1) = '+' THEN RETURN v_digits; END IF;
  v_digits := regexp_replace(v_digits, '\+', '', 'g');
  IF length(v_digits) = 7 THEN
    RETURN '+1242' || v_digits;
  ELSIF length(v_digits) = 10 THEN
    RETURN '+1' || v_digits;
  ELSIF length(v_digits) = 11 AND substring(v_digits FROM 1 FOR 1) = '1' THEN
    RETURN '+' || v_digits;
  ELSE
    RETURN '+' || v_digits;
  END IF;
END;
$$;

-- 2.2 Best-effort backfill of phone_e164 from legacy `phone`.
-- Dedupes by phone_e164 — earliest last_seen wins, others stay NULL.
-- Skips rows where the legacy `phone` column doesn't exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'phone'
  ) THEN
    UPDATE customers c SET phone_e164 = sub.normalized
    FROM (
      SELECT id, bsc_normalize_phone(phone) AS normalized,
             ROW_NUMBER() OVER (
               PARTITION BY bsc_normalize_phone(phone)
               ORDER BY last_seen_at DESC NULLS LAST, created_at DESC NULLS LAST
             ) AS rn
      FROM customers
      WHERE phone IS NOT NULL AND phone <> '' AND phone_e164 IS NULL
    ) sub
    WHERE c.id = sub.id AND sub.rn = 1 AND sub.normalized IS NOT NULL;
  END IF;
END$$;

-- 2.3 Phone lookup — name + email only, no purchase history.
CREATE OR REPLACE FUNCTION bsc_lookup_customer_by_phone(p_raw_phone TEXT)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  phone_e164  TEXT,
  is_active   BOOLEAN
)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_normalized TEXT;
BEGIN
  v_normalized := bsc_normalize_phone(p_raw_phone);
  IF v_normalized IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.full_name, c.email, c.phone_e164, c.is_active
  FROM customers c
  WHERE c.phone_e164 = v_normalized
    AND c.is_walk_in_anonymous = FALSE
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION bsc_lookup_customer_by_phone(TEXT) TO authenticated;

-- 2.4 Upsert — phone is the key; required: phone + name + email.
-- Writes BOTH phone_e164 (new) and phone (legacy) so downstream code
-- that still reads `phone` keeps working. Existing rows are detected
-- by phone_e164 OR legacy phone match.
CREATE OR REPLACE FUNCTION bsc_upsert_customer(
  p_raw_phone     TEXT,
  p_full_name     TEXT,
  p_email         TEXT,
  p_origin        customer_origin_channel,
  p_qr_source     TEXT DEFAULT NULL,
  p_phone_country TEXT DEFAULT NULL,
  p_created_by    UUID DEFAULT NULL,
  p_force_update  BOOLEAN DEFAULT FALSE
)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_normalized TEXT;
  v_existing   UUID;
  v_has_phone_col BOOLEAN;
  v_has_source_col BOOLEAN;
BEGIN
  v_normalized := bsc_normalize_phone(p_raw_phone);

  IF v_normalized IS NULL THEN RAISE EXCEPTION 'Phone is required for customer upsert.'; END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN RAISE EXCEPTION 'Full name is required.'; END IF;
  IF p_email     IS NULL OR length(trim(p_email))     = 0 THEN RAISE EXCEPTION 'Email is required.'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'phone'
  ) INTO v_has_phone_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'source'
  ) INTO v_has_source_col;

  -- Match by phone_e164 first, then fall back to legacy phone column.
  SELECT id INTO v_existing FROM customers WHERE phone_e164 = v_normalized LIMIT 1;

  IF v_existing IS NULL AND v_has_phone_col THEN
    EXECUTE 'SELECT id FROM customers WHERE phone = $1 LIMIT 1'
      INTO v_existing USING v_normalized;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE customers SET
      phone_e164    = COALESCE(phone_e164, v_normalized),
      phone_raw     = COALESCE(phone_raw, p_raw_phone),
      phone_country = COALESCE(phone_country, p_phone_country),
      origin_channel = COALESCE(origin_channel, p_origin),
      qr_source      = COALESCE(qr_source, p_qr_source),
      full_name      = CASE WHEN p_force_update THEN p_full_name ELSE full_name END,
      email          = CASE WHEN p_force_update THEN p_email     ELSE email     END,
      last_seen_at   = NOW(),
      updated_at     = NOW()
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  -- INSERT — dynamic to handle whether legacy `phone`/`source` columns exist.
  EXECUTE format($f$
    INSERT INTO customers (
      phone_e164, phone_raw, phone_country,
      full_name, email,
      origin_channel, qr_source,
      is_walk_in_anonymous, is_active,
      created_by, last_seen_at, created_at, updated_at
      %s %s
    )
    VALUES (
      $1, $2, $3,
      $4, $5,
      $6, $7,
      FALSE, TRUE,
      $8, NOW(), NOW(), NOW()
      %s %s
    )
    RETURNING id
  $f$,
    CASE WHEN v_has_phone_col  THEN ', phone'  ELSE '' END,
    CASE WHEN v_has_source_col THEN ', source' ELSE '' END,
    CASE WHEN v_has_phone_col  THEN ', $1'                            ELSE '' END,
    CASE WHEN v_has_source_col THEN format(', %L', p_origin::TEXT)    ELSE '' END
  )
  INTO v_existing
  USING v_normalized, p_raw_phone, p_phone_country,
        p_full_name, p_email,
        p_origin, p_qr_source,
        p_created_by;

  RETURN v_existing;
END;
$$;

GRANT EXECUTE ON FUNCTION bsc_upsert_customer(TEXT,TEXT,TEXT,customer_origin_channel,TEXT,TEXT,UUID,BOOLEAN) TO authenticated;

-- 2.5 Singleton walk-in record + touch trigger
INSERT INTO customers (
  id, phone_e164, full_name, email,
  is_walk_in_anonymous, origin_channel, notes
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'Walk-In Anonymous',
  NULL,
  TRUE,
  'walk_in_anonymous',
  'Shared singleton for walk-in customers who decline to share contact info. Do not delete.'
)
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_walk_in_singleton
  ON customers ((is_walk_in_anonymous)) WHERE is_walk_in_anonymous = TRUE;

CREATE OR REPLACE FUNCTION customers_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END$$;

DROP TRIGGER IF EXISTS trg_customers_touch_updated_at ON customers;
CREATE TRIGGER trg_customers_touch_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 3: ROW-LEVEL SECURITY (matches existing codebase pattern)
-- ─────────────────────────────────────────────────────────────────────
-- Helper: customer-touching staff (POS + admin + processing).
CREATE OR REPLACE FUNCTION is_bsc_customer_staff() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN (
        'founder','co_founder','control_admin','basic_admin',
        'manager','processor','receiver','cashier','andros_staff'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION is_bsc_customer_staff() TO authenticated;

ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_customers_read         ON customers;
DROP POLICY IF EXISTS p_customers_insert       ON customers;
DROP POLICY IF EXISTS p_customers_update       ON customers;
DROP POLICY IF EXISTS p_customers_delete_block ON customers;

CREATE POLICY p_customers_read   ON customers FOR SELECT USING (is_bsc_customer_staff());
CREATE POLICY p_customers_insert ON customers FOR INSERT WITH CHECK (is_bsc_customer_staff());
CREATE POLICY p_customers_update ON customers FOR UPDATE
  USING (is_bsc_customer_staff()) WITH CHECK (is_bsc_customer_staff());
CREATE POLICY p_customers_delete_block ON customers FOR DELETE USING (FALSE);

-- Pricing rules: anyone authenticated can READ (so client-side previews
-- match the DB); only admins can WRITE.
DROP POLICY IF EXISTS p_pricing_rules_read  ON pricing_rules;
DROP POLICY IF EXISTS p_pricing_rules_write ON pricing_rules;

CREATE POLICY p_pricing_rules_read  ON pricing_rules FOR SELECT USING (TRUE);
CREATE POLICY p_pricing_rules_write ON pricing_rules FOR ALL
  USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());

DROP POLICY IF EXISTS p_pricing_config_read  ON pricing_config;
DROP POLICY IF EXISTS p_pricing_config_write ON pricing_config;

CREATE POLICY p_pricing_config_read  ON pricing_config FOR SELECT USING (TRUE);
CREATE POLICY p_pricing_config_write ON pricing_config FOR ALL
  USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────
SELECT channel, markup_pct, vat_pct FROM pricing_rules ORDER BY channel;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN (
    'phone_e164','phone_raw','phone_country','is_walk_in_anonymous',
    'origin_channel','qr_source','is_active','notes','created_by'
  )
ORDER BY column_name;

SELECT polname FROM pg_policy
WHERE polrelid IN ('customers'::regclass, 'pricing_rules'::regclass, 'pricing_config'::regclass)
ORDER BY polname;

-- ─────────────────────────────────────────────────────────────────────
-- POST-MIGRATION NOTES
-- ─────────────────────────────────────────────────────────────────────
-- 1. Wholesale qualifies PER LINE ITEM (per product). 4 lbs snapper +
--    8 lbs salmon stays retail on both lines. Only when ONE product
--    crosses 10 lbs does that line upgrade to wholesale.
-- 2. Bill Casale 5% is a payout-layer concern, NOT inside pricing_rules.
-- 3. Walk-In Anonymous id: 00000000-0000-0000-0000-000000000001
-- 4. Manny lobster export is manual quoting at market price — outside
--    these rules. Do not auto-price his orders.
-- 5. Backfill best-effort: customers with parseable legacy `phone`
--    get phone_e164; duplicates keep the most recent only, the others
--    stay NULL. Re-onboard via /pos phone-lookup as they come in.
