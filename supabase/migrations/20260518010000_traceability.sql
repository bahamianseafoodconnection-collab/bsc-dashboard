-- Vendor traceability — three-phase chain of custody from catch/harvest
-- through Spiny Tail processing.
--
-- For fishermen the 3 phases are:
--   1. Harbour departure (vessel + permission to leave on a date)
--   2. First catch (showing freshness + handling from dinghy → main vessel freezer)
--   3. Final fishing date (last catch / return to harbour)
--
-- For farmers:
--   1. Seeding begins
--   2. First ready crop
--   3. Final harvest
--
-- Every uploaded photo/video carries lat/lng + timestamp. On admin
-- approval of the listing we generate a batch_number + a batch row
-- and forward to Spiny Tail with vessel/farm metadata.

-- ─── Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS traceability_phases (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID         REFERENCES vendor_listings(id) ON DELETE CASCADE,
  vendor_id         UUID         REFERENCES vendors(id)         ON DELETE SET NULL,
  phase_number      INT          NOT NULL CHECK (phase_number BETWEEN 1 AND 3),
  phase_label       TEXT         NOT NULL,            -- 'harbour_departure' | 'first_catch' | 'final_fishing' | 'seeding' | 'first_ready_crop' | 'final_harvest'
  media_type        TEXT         NOT NULL CHECK (media_type IN ('photo','video')),
  media_url         TEXT         NOT NULL,
  latitude          NUMERIC(10,6),
  longitude         NUMERIC(10,6),
  gps_accuracy_m    NUMERIC(8,2),
  captured_at       TIMESTAMPTZ,                       -- when the user captured (best-effort from device)
  uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS traceability_phases_listing_idx ON traceability_phases (listing_id);
CREATE INDEX IF NOT EXISTS traceability_phases_vendor_idx  ON traceability_phases (vendor_id);

CREATE TABLE IF NOT EXISTS traceability_batches (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number                TEXT         UNIQUE NOT NULL,
  listing_id                  UUID         NOT NULL REFERENCES vendor_listings(id) ON DELETE RESTRICT,
  vendor_id                   UUID         NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_type                 TEXT         NOT NULL CHECK (vendor_type IN ('fisherman','farmer','other')),
  -- product identity
  product_name                TEXT         NOT NULL,
  scientific_name             TEXT,
  quantity_units              NUMERIC(10,2),                      -- number of bags / boxes IN at intake
  quantity_unit_type          TEXT,                               -- 'bag' | 'box' | 'each'
  raw_weight_lbs              NUMERIC(10,2),                      -- weight at Spiny Tail intake (pre-processing)
  vendor_payout_snapshot      NUMERIC(12,2),                      -- snapshot at approval: price_per_unit * quantity
  -- post-processing finished product
  finished_boxes              INT,                                -- count of finished boxes
  finished_weight_lbs         NUMERIC(10,2),                      -- final processed weight
  yield_pct                   NUMERIC(6,2),                       -- auto: finished_weight / raw_weight * 100
  product_cost_per_lb         NUMERIC(10,4),                      -- auto: vendor_payout_snapshot / finished_weight_lbs
  final_qc_notes              TEXT,                               -- QC notes recorded after processing
  -- vessel context (fisherman) — denormalised from vendor at approval time
  vessel_name                 TEXT,
  vessel_registration         TEXT,
  captain_name                TEXT,
  vessel_owner_name           TEXT,
  vessel_registration_doc_url TEXT,
  -- farm context (farmer)
  farm_name                   TEXT,
  farm_license_number         TEXT,
  farm_license_doc_url        TEXT,
  farmer_id_doc_url           TEXT,
  -- lifecycle
  status                      TEXT         NOT NULL DEFAULT 'pending_processing'
                              CHECK (status IN ('pending_processing','at_processing','processed','rejected')),
  approved_by                 UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at                 TIMESTAMPTZ,
  sent_to_processing_at       TIMESTAMPTZ,
  processed_at                TIMESTAMPTZ,
  processing_notes            TEXT,
  -- shelf life + expiry (production_date set at processing; expiry
  -- auto-computed via the trigger below).
  shelf_life_days             INT,                                -- set at admin approval based on product
  production_date             DATE,                               -- stamped by processing operator
  expiry_date                 DATE,                               -- auto = production_date + shelf_life_days
  processing_operator_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  -- product-class packaging rules (industry-specific)
  product_size_grade          TEXT,                               -- e.g. lobster "5oz"|"6oz"|"10/12"|"20UP"
  package_lbs                 NUMERIC(8,2),                       -- per-box lbs (e.g. 5 for conch boxes)
  master_case_lbs             NUMERIC(8,2),                       -- per-master-case lbs (40 lobster, 50 conch)
  master_cases_count          NUMERIC(8,2),                       -- auto: finished_weight_lbs / master_case_lbs
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS traceability_batches_listing_idx ON traceability_batches (listing_id);
CREATE INDEX IF NOT EXISTS traceability_batches_status_idx  ON traceability_batches (status);
CREATE INDEX IF NOT EXISTS traceability_batches_number_idx  ON traceability_batches (batch_number);

-- ─── Vessel + farm columns on vendors ─────────────────────────────
-- Filled during vendor signup or later via /vendor/dashboard; copied
-- to traceability_batches at approval time so a vendor can change
-- vessels without rewriting history.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vessel_name                 TEXT,
  ADD COLUMN IF NOT EXISTS vessel_registration         TEXT,
  ADD COLUMN IF NOT EXISTS captain_name                TEXT,
  ADD COLUMN IF NOT EXISTS vessel_owner_name           TEXT,
  ADD COLUMN IF NOT EXISTS vessel_registration_doc_url TEXT,
  ADD COLUMN IF NOT EXISTS farm_name                   TEXT,
  ADD COLUMN IF NOT EXISTS farm_license_number         TEXT,
  ADD COLUMN IF NOT EXISTS farm_license_doc_url        TEXT,
  ADD COLUMN IF NOT EXISTS farmer_id_doc_url           TEXT;

-- ─── Auto-compute expiry_date, yield_pct, product_cost_per_lb ─────
-- One trigger handles all three derived fields so they stay in sync
-- with whichever raw value the operator updates.

CREATE OR REPLACE FUNCTION set_batch_derived_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Expiry from production_date + shelf_life_days
  IF NEW.production_date IS NOT NULL AND NEW.shelf_life_days IS NOT NULL THEN
    NEW.expiry_date := NEW.production_date + (NEW.shelf_life_days || ' days')::INTERVAL;
  ELSE
    NEW.expiry_date := NULL;
  END IF;
  -- Yield % = finished / raw * 100
  IF NEW.finished_weight_lbs IS NOT NULL AND NEW.raw_weight_lbs IS NOT NULL AND NEW.raw_weight_lbs > 0 THEN
    NEW.yield_pct := ROUND((NEW.finished_weight_lbs / NEW.raw_weight_lbs) * 100, 2);
  ELSE
    NEW.yield_pct := NULL;
  END IF;
  -- Product cost / lb = vendor_payout_snapshot / finished_weight_lbs
  IF NEW.vendor_payout_snapshot IS NOT NULL AND NEW.finished_weight_lbs IS NOT NULL AND NEW.finished_weight_lbs > 0 THEN
    NEW.product_cost_per_lb := ROUND(NEW.vendor_payout_snapshot / NEW.finished_weight_lbs, 4);
  ELSE
    NEW.product_cost_per_lb := NULL;
  END IF;
  -- Master cases = finished / master_case_lbs (e.g. 40 lbs lobster, 50 lbs conch)
  IF NEW.finished_weight_lbs IS NOT NULL AND NEW.master_case_lbs IS NOT NULL AND NEW.master_case_lbs > 0 THEN
    NEW.master_cases_count := ROUND(NEW.finished_weight_lbs / NEW.master_case_lbs, 2);
  ELSE
    NEW.master_cases_count := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trace_batches_expiry_trg     ON traceability_batches;
DROP TRIGGER IF EXISTS trace_batches_derived_trg    ON traceability_batches;
CREATE TRIGGER trace_batches_derived_trg
  BEFORE INSERT OR UPDATE OF production_date, shelf_life_days,
                              raw_weight_lbs, finished_weight_lbs,
                              vendor_payout_snapshot, master_case_lbs
  ON traceability_batches
  FOR EACH ROW
  EXECUTE FUNCTION set_batch_derived_fields();

-- ─── Batch-number generator ───────────────────────────────────────
-- Format:
--   BSC-FISH-YYYYMMDD-NNN  (fisherman)
--   BSC-FARM-YYYYMMDD-NNN  (farmer)
--   BSC-VEND-YYYYMMDD-NNN  (other)
-- NNN is the per-day per-type sequence (zero-padded).

CREATE OR REPLACE FUNCTION generate_batch_number(p_vendor_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
  d      TEXT := to_char(NOW() AT TIME ZONE 'America/Nassau', 'YYYYMMDD');
  n      INT;
BEGIN
  prefix := CASE p_vendor_type
              WHEN 'fisherman' THEN 'BSC-FISH'
              WHEN 'farmer'    THEN 'BSC-FARM'
              ELSE                  'BSC-VEND'
            END;
  SELECT COUNT(*) + 1 INTO n
  FROM traceability_batches
  WHERE batch_number LIKE prefix || '-' || d || '-%';
  RETURN prefix || '-' || d || '-' || LPAD(n::text, 3, '0');
END;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────
ALTER TABLE traceability_phases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE traceability_batches ENABLE ROW LEVEL SECURITY;

-- phases: vendor reads own; admin + QC read all; insert by vendor (own listing).
DROP POLICY IF EXISTS "trace_phases_vendor_self" ON traceability_phases;
DROP POLICY IF EXISTS "trace_phases_admin_all"   ON traceability_phases;
DROP POLICY IF EXISTS "trace_phases_qc_read"     ON traceability_phases;
CREATE POLICY "trace_phases_vendor_self" ON traceability_phases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
  );
CREATE POLICY "trace_phases_admin_all" ON traceability_phases
  FOR ALL USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());
CREATE POLICY "trace_phases_qc_read" ON traceability_phases
  FOR SELECT USING (is_bsc_qc_staff());

-- batches: admin manages; vendor reads own; QC reads + updates weight + processing.
DROP POLICY IF EXISTS "trace_batches_admin_all"  ON traceability_batches;
DROP POLICY IF EXISTS "trace_batches_vendor_read" ON traceability_batches;
DROP POLICY IF EXISTS "trace_batches_qc_read"    ON traceability_batches;
DROP POLICY IF EXISTS "trace_batches_qc_update"  ON traceability_batches;
CREATE POLICY "trace_batches_admin_all" ON traceability_batches
  FOR ALL USING (is_bsc_admin()) WITH CHECK (is_bsc_admin());
CREATE POLICY "trace_batches_vendor_read" ON traceability_batches
  FOR SELECT USING (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
CREATE POLICY "trace_batches_qc_read" ON traceability_batches
  FOR SELECT USING (is_bsc_qc_staff());
CREATE POLICY "trace_batches_qc_update" ON traceability_batches
  FOR UPDATE USING (is_bsc_qc_staff()) WITH CHECK (is_bsc_qc_staff());

-- ─── Verify ───────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('traceability_phases','traceability_batches')
ORDER BY table_name;
