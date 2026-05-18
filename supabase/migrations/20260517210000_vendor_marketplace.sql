-- BSC Vendor Marketplace — multi-vendor platform foundation.
-- ─────────────────────────────────────────────────────────────────────
-- 5 tables + 2 storage buckets + RLS for vendors, listings, orders,
-- payouts, documents. Quality-control happens at Spiny Tail; BSC
-- delivers after QC pass. Commission = 15% in production, 0% in
-- beta (controlled by the BETA_MODE_VENDORS env, NOT by a DB flag —
-- we still write the math here so flipping the env is the only switch).

-- ─── Tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  business_name            TEXT         NOT NULL,
  vendor_type              TEXT         NOT NULL CHECK (vendor_type IN ('fisherman','farmer','other')),
  contact_name             TEXT,
  phone                    TEXT,
  email                    TEXT,
  government_id_number     TEXT,
  license_number           TEXT,
  location                 TEXT,
  bank_account_name        TEXT,
  bank_account_number      TEXT,
  routing_info             TEXT,
  approval_status          TEXT         NOT NULL DEFAULT 'pending'
                           CHECK (approval_status IN ('pending','approved','suspended','rejected')),
  approved_by              UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at              TIMESTAMPTZ,
  approval_notes           TEXT,
  trust_tier               INT          NOT NULL DEFAULT 1 CHECK (trust_tier BETWEEN 1 AND 3),
  total_listings           INT          NOT NULL DEFAULT 0,
  total_sales              NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_payouts            NUMERIC(12,2) NOT NULL DEFAULT 0,
  quality_rejections_count INT          NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendors_approval_idx ON vendors (approval_status);
CREATE INDEX IF NOT EXISTS vendors_user_idx     ON vendors (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendor_documents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID         NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  document_type TEXT         NOT NULL CHECK (document_type IN ('photo','video','id','license')),
  file_url      TEXT         NOT NULL,
  description   TEXT,
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_documents_vendor_idx ON vendor_documents (vendor_id);

CREATE TABLE IF NOT EXISTS vendor_listings (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           UUID         NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title               TEXT         NOT NULL,
  description         TEXT,
  product_type        TEXT,
  quantity_available  NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit                TEXT         NOT NULL DEFAULT 'lb',
  price_per_unit      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT         NOT NULL DEFAULT 'BSD',
  status              TEXT         NOT NULL DEFAULT 'pending_approval'
                      CHECK (status IN ('pending_approval','live','sold_out','expired','rejected')),
  harvest_status      TEXT         CHECK (harvest_status IN ('ready_to_harvest','harvested','landing_soon')),
  harvest_or_catch_time TIMESTAMPTZ,
  available_until     TIMESTAMPTZ,
  photos              TEXT[]       NOT NULL DEFAULT '{}',
  videos              TEXT[]       NOT NULL DEFAULT '{}',
  dropoff_location    TEXT         NOT NULL DEFAULT 'spiny_tail',
  dropoff_expected_at TIMESTAMPTZ,
  approved_by         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_listings_vendor_idx ON vendor_listings (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_listings_status_idx ON vendor_listings (status);
CREATE INDEX IF NOT EXISTS vendor_listings_live_idx
  ON vendor_listings (created_at DESC) WHERE status = 'live';

CREATE TABLE IF NOT EXISTS vendor_orders (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id               UUID         NOT NULL REFERENCES vendor_listings(id) ON DELETE RESTRICT,
  customer_id              UUID         REFERENCES customers(id) ON DELETE SET NULL,
  vendor_id                UUID         NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  quantity                 NUMERIC(12,3) NOT NULL,
  total_price              NUMERIC(12,2) NOT NULL,
  commission_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendor_payout            NUMERIC(12,2) NOT NULL DEFAULT 0,
  status                   TEXT         NOT NULL DEFAULT 'reserved'
                           CHECK (status IN ('reserved','paid','dropped_off','qc_pending','qc_passed','qc_rejected','delivered_to_customer','refunded')),
  dropoff_at               TIMESTAMPTZ,
  qc_inspected_at          TIMESTAMPTZ,
  qc_inspector_id          UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  qc_notes                 TEXT,
  delivered_to_customer_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_orders_listing_idx  ON vendor_orders (listing_id);
CREATE INDEX IF NOT EXISTS vendor_orders_vendor_idx   ON vendor_orders (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_orders_customer_idx ON vendor_orders (customer_id);
CREATE INDEX IF NOT EXISTS vendor_orders_qc_idx       ON vendor_orders (status) WHERE status = 'qc_pending';

CREATE TABLE IF NOT EXISTS vendor_payouts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID         NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period_start      DATE         NOT NULL,
  period_end        DATE         NOT NULL,
  total_sales       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_commission  NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payout        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status            TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','failed')),
  paid_at           TIMESTAMPTZ,
  payment_reference TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_payouts_vendor_idx ON vendor_payouts (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_payouts_status_idx ON vendor_payouts (status);

-- ─── Storage buckets ─────────────────────────────────────────────────
-- vendor-documents = private (signed URLs); vendor-listings = public for
-- approved listing photos/videos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-documents','vendor-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-listings','vendor-listings', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — vendors upload to their own folder vendor/<user_id>/
DROP POLICY IF EXISTS "vendor_documents_owner_rw" ON storage.objects;
CREATE POLICY "vendor_documents_owner_rw" ON storage.objects
  FOR ALL
  USING  (bucket_id = 'vendor-documents'
          AND (auth.role() = 'service_role'
               OR (SPLIT_PART(name, '/', 1) = COALESCE(auth.uid()::text,''))))
  WITH CHECK (bucket_id = 'vendor-documents'
          AND (auth.role() = 'service_role'
               OR (SPLIT_PART(name, '/', 1) = COALESCE(auth.uid()::text,''))));

DROP POLICY IF EXISTS "vendor_listings_public_read" ON storage.objects;
CREATE POLICY "vendor_listings_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'vendor-listings');

DROP POLICY IF EXISTS "vendor_listings_owner_write" ON storage.objects;
CREATE POLICY "vendor_listings_owner_write" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'vendor-listings'
              AND (auth.role() = 'service_role'
                   OR (SPLIT_PART(name, '/', 1) = COALESCE(auth.uid()::text,''))));

-- ─── Helper: is current user an admin / staff role? ──────────────────
CREATE OR REPLACE FUNCTION is_bsc_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('founder','co_founder','control_admin','basic_admin','manager')
  );
$$;

CREATE OR REPLACE FUNCTION is_bsc_qc_staff() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('founder','co_founder','control_admin','manager','processor','receiver')
  );
$$;

-- ─── RLS policies ────────────────────────────────────────────────────
ALTER TABLE vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payouts    ENABLE ROW LEVEL SECURITY;

-- vendors
DROP POLICY IF EXISTS "vendors_insert_self"       ON vendors;
DROP POLICY IF EXISTS "vendors_select_self_admin" ON vendors;
DROP POLICY IF EXISTS "vendors_update_self_admin" ON vendors;
CREATE POLICY "vendors_insert_self" ON vendors
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "vendors_select_self_admin" ON vendors
  FOR SELECT USING (user_id = auth.uid() OR is_bsc_admin());
CREATE POLICY "vendors_update_self_admin" ON vendors
  FOR UPDATE USING (user_id = auth.uid() OR is_bsc_admin())
            WITH CHECK (user_id = auth.uid() OR is_bsc_admin());

-- vendor_documents
DROP POLICY IF EXISTS "vendor_documents_owner_admin" ON vendor_documents;
CREATE POLICY "vendor_documents_owner_admin" ON vendor_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR is_bsc_admin()
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
    OR is_bsc_admin()
  );

-- vendor_listings
DROP POLICY IF EXISTS "vendor_listings_public_read"  ON vendor_listings;
DROP POLICY IF EXISTS "vendor_listings_owner_read"   ON vendor_listings;
DROP POLICY IF EXISTS "vendor_listings_owner_write"  ON vendor_listings;
DROP POLICY IF EXISTS "vendor_listings_admin_all"    ON vendor_listings;
CREATE POLICY "vendor_listings_public_read" ON vendor_listings
  FOR SELECT USING (status = 'live');
CREATE POLICY "vendor_listings_owner_read" ON vendor_listings
  FOR SELECT USING (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "vendor_listings_owner_write" ON vendor_listings
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "vendor_listings_admin_all" ON vendor_listings
  FOR ALL USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());

-- vendor_orders
-- (Customer self-view will be added back as a server-side route once
-- the customers table is finalised with an auth.users link column.
-- Production schema does NOT currently expose customers.auth_user_id,
-- so the previous EXISTS-based policy fails. Admin + vendor + QC
-- policies still cover the live flow.)
DROP POLICY IF EXISTS "vendor_orders_customer_self"  ON vendor_orders;
DROP POLICY IF EXISTS "vendor_orders_vendor_self"    ON vendor_orders;
DROP POLICY IF EXISTS "vendor_orders_admin_all"      ON vendor_orders;
DROP POLICY IF EXISTS "vendor_orders_qc_update"      ON vendor_orders;
CREATE POLICY "vendor_orders_vendor_self" ON vendor_orders
  FOR SELECT USING (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "vendor_orders_admin_all" ON vendor_orders
  FOR ALL USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());
CREATE POLICY "vendor_orders_qc_update" ON vendor_orders
  FOR UPDATE USING (is_bsc_qc_staff()) WITH CHECK (is_bsc_qc_staff());

-- vendor_payouts
DROP POLICY IF EXISTS "vendor_payouts_owner_read" ON vendor_payouts;
DROP POLICY IF EXISTS "vendor_payouts_admin_all"  ON vendor_payouts;
CREATE POLICY "vendor_payouts_owner_read" ON vendor_payouts
  FOR SELECT USING (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "vendor_payouts_admin_all" ON vendor_payouts
  FOR ALL USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());

-- ─── Verify ──────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'vendor%'
ORDER BY table_name;
