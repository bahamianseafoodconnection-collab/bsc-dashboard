-- =====================================================================
-- BSC Migration: 20260519050000_spinytails_haccp_traceability.sql
--
-- Purpose: Wire the Spiny Tails Processing Co. HACCP + SSOP +
--   Traceability Master into the BSC dashboard so every form required
--   by the document has a Supabase table behind it, and so the Lot
--   Code system threads all the way from vessel intake to export
--   shipment.
--
-- Author: Founder AI for Dedrick T. Storr Snr
-- Date:   2026-05-19
--
-- Patches applied vs. the originally-authored SQL:
--   1. Every REFERENCES users(id) → REFERENCES auth.users(id)
--      ON DELETE SET NULL (this project has no public.users — same
--      fix as commit 7600889). One NOT NULL FK (training_records
--      .staff_id) is relaxed to nullable so SET NULL stays valid;
--      the audit-trail intent is preserved (records survive user
--      deletion, just unlinked).
--   2. RLS uses existing helpers from earlier migrations:
--        SELECT  → is_bsc_qc_staff()
--        INSERT/UPDATE → is_bsc_qc_staff()
--        DELETE → is_bsc_admin() only (protects audit trail)
--      bsc_current_user_role() was never created in this DB; we use
--      the codebase's standard role helpers instead.
--   3. Inspector read-only role deferred — see TODO marker.
--   4. Structural fix: master_packagings.sanitation_signoff_id FK to
--      spinytails_sanitation_checks is declared via ALTER TABLE
--      AFTER both tables exist (DEFERRABLE applies to runtime row
--      checks, not DDL creation order). DEFERRABLE INITIALLY
--      DEFERRED preserved on the ALTER TABLE add.
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 1: REFERENCE ENUMS
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vessel_status') THEN
    CREATE TYPE vessel_status AS ENUM ('approved','suspended','inactive');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_state') THEN
    CREATE TYPE product_state AS ENUM ('fresh','frozen');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qc_result') THEN
    CREATE TYPE qc_result AS ENUM ('pass','fail','pending');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'temp_location') THEN
    CREATE TYPE temp_location AS ENUM (
      'receiving_freezer','thaw_vat','processing_room_ambient',
      'blast_freezer','distribution_freezer','transport_vehicle'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lobster_grade') THEN
    CREATE TYPE lobster_grade AS ENUM (
      '5oz','6oz','7oz','8oz','9oz',
      '10_12oz','12_14oz','14_16oz','16_20oz','20oz_plus',
      'not_for_export'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lot_status') THEN
    CREATE TYPE lot_status AS ENUM (
      'received',              -- Step 1-2 complete
      'in_receiving_freezer',  -- Step 3
      'thawing',               -- Step 4
      'processing',            -- Steps 5-7
      'blast_freezing',        -- Step 8
      'mastered',              -- Step 9 complete
      'in_distribution',       -- Step 10
      'shipped',               -- Step 11
      'rejected',              -- failed CCP
      'recalled'               -- post-shipment recall
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ssop_id') THEN
    CREATE TYPE ssop_id AS ENUM (
      'ssop_01_water','ssop_02_facility_cleanliness','ssop_03_cross_contamination',
      'ssop_04_handwash_toilets','ssop_05_food_protection','ssop_06_toxic_chemicals',
      'ssop_07_employee_health','ssop_08_pest_exclusion','ssop_09_waste_disposal',
      'ssop_10_outside_contractors','ssop_11_transport_vehicles','ssop_12_raw_material_storage'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ccp_id') THEN
    CREATE TYPE ccp_id AS ENUM (
      'ccp1_receiving','ccp2_thawing','ccp3_deveining_sulfite',
      'ccp4_blast_freezing','ccp5_labeling'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 2: VESSEL REGISTRY
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_vessels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_code         CHAR(2) NOT NULL UNIQUE,                     -- e.g. 'AT','SP'
  vessel_name         TEXT,
  fisherman_name      TEXT NOT NULL,
  fisherman_phone     TEXT,
  fisherman_address   TEXT,
  license_number      TEXT,
  color_tag           TEXT NOT NULL,                               -- 'Red','Blue','Green','Yellow', ...
  status              vessel_status NOT NULL DEFAULT 'approved',
  approved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at        TIMESTAMPTZ,
  suspension_reason   TEXT,
  reinstated_at       TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT spinytails_vessels_code_format CHECK (vessel_code ~ '^[A-Z]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spinytails_vessels_color_active
  ON spinytails_vessels (color_tag) WHERE status = 'approved';

-- Seed the two we know about
INSERT INTO spinytails_vessels (vessel_code, fisherman_name, color_tag, status, notes) VALUES
  ('AT', 'Anthony Taylor',       'Red',  'approved', 'First direct boat supplier'),
  ('SP', '(Sandy Port captain)', 'Blue', 'approved', 'Abaco-based conch & lobster')
ON CONFLICT (vessel_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 3: LOT CODE — THE BACKBONE
-- A "lot" is one intake from one vessel on one date. It carries
-- through every subsequent step. Lot code: STPC-YYYYMMDD-VV-NN
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code        TEXT NOT NULL UNIQUE,
  receipt_date    DATE NOT NULL,
  vessel_id       UUID NOT NULL REFERENCES spinytails_vessels(id),
  daily_sequence  INT NOT NULL,                                    -- NN
  status          lot_status NOT NULL DEFAULT 'received',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  shipped_at      TIMESTAMPTZ,
  recalled_at     TIMESTAMPTZ,
  recall_reason   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT spinytails_lots_code_format  CHECK (lot_code ~ '^STPC-[0-9]{8}-[A-Z]{2}-[0-9]{2}$'),
  CONSTRAINT spinytails_lots_unique_daily UNIQUE (receipt_date, vessel_id, daily_sequence)
);

CREATE INDEX IF NOT EXISTS idx_spinytails_lots_status       ON spinytails_lots (status);
CREATE INDEX IF NOT EXISTS idx_spinytails_lots_receipt_date ON spinytails_lots (receipt_date DESC);

-- Helper: generate the next lot code for a given vessel + date.
CREATE OR REPLACE FUNCTION spinytails_next_lot_code(
  p_receipt_date DATE,
  p_vessel_code  TEXT
) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_seq INT;
  v_lot TEXT;
BEGIN
  SELECT COALESCE(MAX(daily_sequence), 0) + 1 INTO v_seq
  FROM spinytails_lots l
  JOIN spinytails_vessels v ON v.id = l.vessel_id
  WHERE l.receipt_date = p_receipt_date AND v.vessel_code = p_vessel_code;

  v_lot := 'STPC-'
        || to_char(p_receipt_date, 'YYYYMMDD')
        || '-'
        || p_vessel_code
        || '-'
        || lpad(v_seq::TEXT, 2, '0');

  RETURN v_lot;
END;
$$;

COMMENT ON FUNCTION spinytails_next_lot_code IS
  'Generates the next Lot Code (STPC-YYYYMMDD-VV-NN) for a given vessel/date. Call this BEFORE inserting into spinytails_lots.';

GRANT EXECUTE ON FUNCTION spinytails_next_lot_code(DATE, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 4: LOBSTER RECEIVING RECORD (Step 1-2, CCP-1)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_lot_intakes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                   UUID NOT NULL UNIQUE REFERENCES spinytails_lots(id),
  intake_time              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity_lbs             NUMERIC(10,2) NOT NULL CHECK (quantity_lbs > 0),
  product_state            product_state NOT NULL,
  fishing_area             TEXT,
  fishing_date_start       DATE,
  fishing_date_end         DATE,
  core_temp_f_at_receipt   NUMERIC(5,2),
  received_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- CCP-1 enforces these:
  CONSTRAINT receipt_temp_fresh_check CHECK (
    product_state <> 'fresh' OR core_temp_f_at_receipt IS NULL OR core_temp_f_at_receipt <= 40.0
  ),
  CONSTRAINT receipt_temp_frozen_check CHECK (
    product_state <> 'frozen' OR core_temp_f_at_receipt IS NULL OR core_temp_f_at_receipt <= 0.0
  )
);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 5: LOBSTER QUALITY & SAFETY RECORD (Step 2, CCP-1)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_quality_inspections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                UUID NOT NULL REFERENCES spinytails_lots(id),
  inspected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sample_lbs            NUMERIC(8,2) NOT NULL CHECK (sample_lbs > 0),
  sulfite_ppm           NUMERIC(6,2),
  tail_length_ok        BOOLEAN,
  egg_bearing_found     BOOLEAN,
  clipped_fins_found    BOOLEAN,
  off_odor              BOOLEAN,
  melanosis_ok          BOOLEAN,
  soft_shell_found      BOOLEAN,
  foreign_matter_found  BOOLEAN,
  result                qc_result NOT NULL,
  qa_personnel          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- CCP-1: sulfite limit
  CONSTRAINT sulfite_limit_check CHECK (sulfite_ppm IS NULL OR sulfite_ppm >= 0)
);

CREATE INDEX IF NOT EXISTS idx_spinytails_qc_lot ON spinytails_quality_inspections (lot_id);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 6: TEMPERATURE CONTROL RECORD (Steps 3, 4, 8, 10)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_temperature_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location              temp_location NOT NULL,
  lot_id                UUID REFERENCES spinytails_lots(id),  -- nullable: ambient checks not tied to a lot
  reading_f             NUMERIC(6,2) NOT NULL,
  within_limit          BOOLEAN NOT NULL,
  data_logger_confirms  BOOLEAN,
  recorded_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_if_fail        TEXT,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_spinytails_temp_logs_lot           ON spinytails_temperature_logs (lot_id);
CREATE INDEX IF NOT EXISTS idx_spinytails_temp_logs_time          ON spinytails_temperature_logs (logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_spinytails_temp_logs_location_time ON spinytails_temperature_logs (location, logged_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 7: PROCESSING LOG (Steps 5-7, CCP-3)
-- One row per processing batch. Yield % computed from totals.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_processing_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id              UUID NOT NULL REFERENCES spinytails_lots(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  lbs_in              NUMERIC(10,2) NOT NULL CHECK (lbs_in > 0),
  lbs_graded          NUMERIC(10,2) NOT NULL DEFAULT 0,
  lbs_not_for_export  NUMERIC(10,2) NOT NULL DEFAULT 0,
  yield_pct           NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN lbs_in > 0 THEN ROUND((lbs_graded / lbs_in) * 100, 2) ELSE NULL END
  ) STORED,
  sulfite_recheck_ppm NUMERIC(6,2),
  boxes_packed        INT,
  supervisor_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sign_off_at         TIMESTAMPTZ,
  notes               TEXT,
  -- CCP-3 sulfite check (informational; enforcement is at the application layer)
  CONSTRAINT sulfite_recheck_nonneg CHECK (sulfite_recheck_ppm IS NULL OR sulfite_recheck_ppm >= 0)
);

CREATE INDEX IF NOT EXISTS idx_spinytails_batches_lot ON spinytails_processing_batches (lot_id);

-- Per-grade breakdown (one row per grade per batch)
CREATE TABLE IF NOT EXISTS spinytails_batch_grades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES spinytails_processing_batches(id) ON DELETE CASCADE,
  grade      lobster_grade NOT NULL,
  weight_lbs NUMERIC(10,2) NOT NULL CHECK (weight_lbs >= 0),
  box_count  INT NOT NULL DEFAULT 0 CHECK (box_count >= 0),
  UNIQUE (batch_id, grade)
);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 8: PACKAGING & LABELING (Step 9, CCP-5)
-- Note: sanitation_signoff_id FK is added at the END of the migration
-- (after spinytails_sanitation_checks exists) so the DDL order works.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_master_packagings (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                        UUID NOT NULL REFERENCES spinytails_lots(id),
  packaged_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  primary_boxes_10lb            INT NOT NULL CHECK (primary_boxes_10lb >= 0),
  master_cartons_40lb           INT NOT NULL CHECK (master_cartons_40lb >= 0),
  sulfite_declaration_present   BOOLEAN NOT NULL,
  allergen_declaration_present  BOOLEAN NOT NULL,
  scientific_name_present       BOOLEAN NOT NULL,
  lot_code_matches_inside       BOOLEAN NOT NULL,
  production_date_printed       BOOLEAN NOT NULL,
  best_before_date_printed      BOOLEAN NOT NULL,
  supervisor_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sanitation_signoff_id         UUID,  -- FK added below after sanitation_checks exists
  notes                         TEXT,
  -- CCP-5: declarations MUST be present
  CONSTRAINT ccp5_sulfite_decl  CHECK (sulfite_declaration_present = TRUE),
  CONSTRAINT ccp5_allergen_decl CHECK (allergen_declaration_present = TRUE),
  CONSTRAINT ccp5_lot_match     CHECK (lot_code_matches_inside = TRUE)
);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 9: SHIPMENT (Step 11)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_shipments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number       TEXT NOT NULL UNIQUE,
  shipped_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  destination_customer  TEXT NOT NULL,
  destination_country   TEXT NOT NULL,
  total_master_cartons  INT NOT NULL CHECK (total_master_cartons > 0),
  total_weight_lbs      NUMERIC(10,2) NOT NULL CHECK (total_weight_lbs > 0),
  truck_temp_f_at_load  NUMERIC(5,2),
  coi_number            TEXT,  -- Certificate of Inspection
  coi_issued_at         TIMESTAMPTZ,
  coi_inspector_name    TEXT,
  temp_chip_serials     TEXT[],
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT truck_at_zero_or_colder CHECK (truck_temp_f_at_load IS NULL OR truck_temp_f_at_load <= 0.0)
);

-- Lots in a shipment (many-to-many)
CREATE TABLE IF NOT EXISTS spinytails_shipment_lots (
  shipment_id     UUID NOT NULL REFERENCES spinytails_shipments(id) ON DELETE CASCADE,
  lot_id          UUID NOT NULL REFERENCES spinytails_lots(id),
  master_cartons  INT NOT NULL CHECK (master_cartons > 0),
  weight_lbs      NUMERIC(10,2) NOT NULL CHECK (weight_lbs > 0),
  PRIMARY KEY (shipment_id, lot_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 10: DAILY SANITATION CHECKLIST
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_sanitation_checks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date              DATE NOT NULL,
  check_phase             TEXT NOT NULL CHECK (check_phase IN ('pre_op','post_op')),
  sanitation_lead         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ssop                    ssop_id NOT NULL,
  compliant               BOOLEAN NOT NULL,
  corrective_action_notes TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (check_date, check_phase, ssop)
);

CREATE INDEX IF NOT EXISTS idx_spinytails_sanitation_date ON spinytails_sanitation_checks (check_date DESC);

-- Now that sanitation_checks exists, add the deferred FK from master_packagings.
ALTER TABLE spinytails_master_packagings
  ADD CONSTRAINT spinytails_master_packagings_sanitation_fk
  FOREIGN KEY (sanitation_signoff_id)
  REFERENCES spinytails_sanitation_checks(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 11: CORRECTIVE ACTION RECORDS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_corrective_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_number           BIGSERIAL UNIQUE,
  opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ,
  failure_at_step     TEXT NOT NULL,  -- 'Step 2', 'SSOP 4', 'Step 8', etc.
  ccp_reference       ccp_id,
  ssop_reference      ssop_id,
  lot_id              UUID REFERENCES spinytails_lots(id),
  what_failed         TEXT NOT NULL,
  immediate_action    TEXT NOT NULL,
  root_cause          TEXT,
  long_term_action    TEXT,
  verified_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  founder_notified_at TIMESTAMPTZ,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_spinytails_ca_open
  ON spinytails_corrective_actions (opened_at DESC) WHERE closed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 12: TRAINING & CALIBRATION
-- ─────────────────────────────────────────────────────────────────────
-- staff_id is nullable so ON DELETE SET NULL preserves records when an
-- auth.user is removed (HACCP retention intent: records survive,
-- attribution is the only thing lost).
CREATE TABLE IF NOT EXISTS spinytails_training_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  staff_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  topic       TEXT NOT NULL,
  trainer     TEXT,
  outcome     TEXT NOT NULL CHECK (outcome IN ('pass','retake','pending_review')),
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS spinytails_calibration_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  equipment_id        TEXT NOT NULL,
  equipment_type      TEXT NOT NULL,
  calibration_method  TEXT,
  result              TEXT NOT NULL CHECK (result IN ('pass','fail','repaired_reverified')),
  performed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_due            DATE,
  notes               TEXT
);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 13: FULL CHAIN TRACE VIEW
-- One-row-per-lot end-to-end trace, vessel intake → shipment.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW spinytails_lot_full_trace AS
SELECT
  l.lot_code,
  l.status                          AS current_status,
  l.receipt_date,
  v.vessel_code,
  v.fisherman_name,
  v.color_tag,
  v.status                          AS vessel_status,
  i.intake_time,
  i.quantity_lbs                    AS lbs_received,
  i.product_state,
  i.core_temp_f_at_receipt,
  q.sulfite_ppm                     AS receipt_sulfite_ppm,
  q.result                          AS receipt_qc_result,
  pb.lbs_in                         AS processing_lbs_in,
  pb.lbs_graded                     AS processing_lbs_graded,
  pb.yield_pct,
  pb.sulfite_recheck_ppm,
  mp.master_cartons_40lb,
  mp.primary_boxes_10lb,
  mp.sulfite_declaration_present,
  mp.allergen_declaration_present,
  s.shipment_number,
  s.shipped_at,
  s.destination_customer,
  s.destination_country,
  s.coi_number,
  l.rejected_at,
  l.rejected_reason,
  l.recalled_at,
  l.recall_reason
FROM spinytails_lots l
JOIN spinytails_vessels v ON v.id = l.vessel_id
LEFT JOIN spinytails_lot_intakes i ON i.lot_id = l.id
LEFT JOIN LATERAL (
  SELECT * FROM spinytails_quality_inspections qi
  WHERE qi.lot_id = l.id ORDER BY qi.inspected_at LIMIT 1
) q ON TRUE
LEFT JOIN LATERAL (
  SELECT * FROM spinytails_processing_batches pbi
  WHERE pbi.lot_id = l.id ORDER BY pbi.started_at LIMIT 1
) pb ON TRUE
LEFT JOIN LATERAL (
  SELECT * FROM spinytails_master_packagings mpi
  WHERE mpi.lot_id = l.id ORDER BY mpi.packaged_at LIMIT 1
) mp ON TRUE
LEFT JOIN spinytails_shipment_lots sl ON sl.lot_id = l.id
LEFT JOIN spinytails_shipments     s  ON s.id = sl.shipment_id;

COMMENT ON VIEW spinytails_lot_full_trace IS
  'One-row-per-lot end-to-end trace from vessel intake to shipment. Use for fisheries inspectors, BAHFSA audits, and customer recalls.';

GRANT SELECT ON spinytails_lot_full_trace TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 14: TOUCH-UPDATED-AT TRIGGERS
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION spinytails_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spinytails_vessels_touch ON spinytails_vessels;
CREATE TRIGGER trg_spinytails_vessels_touch
  BEFORE UPDATE ON spinytails_vessels
  FOR EACH ROW EXECUTE FUNCTION spinytails_touch_updated_at();

DROP TRIGGER IF EXISTS trg_spinytails_lots_touch ON spinytails_lots;
CREATE TRIGGER trg_spinytails_lots_touch
  BEFORE UPDATE ON spinytails_lots
  FOR EACH ROW EXECUTE FUNCTION spinytails_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 15: ROW-LEVEL SECURITY
--
-- TODO: Inspector read-only role to be added in spinytails_audit_access
-- migration when /spinytails/audit endpoint is built.
--
-- Read + write (insert/update) use is_bsc_qc_staff() — founder,
-- co_founder, control_admin, manager, processor, receiver.
-- Delete uses is_bsc_admin() only — protects the audit trail.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE spinytails_vessels             ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_lots                ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_lot_intakes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_temperature_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_processing_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_batch_grades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_master_packagings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_shipments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_shipment_lots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_sanitation_checks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_corrective_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_training_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_calibration_logs    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'spinytails_vessels','spinytails_lots','spinytails_lot_intakes',
    'spinytails_quality_inspections','spinytails_temperature_logs',
    'spinytails_processing_batches','spinytails_batch_grades',
    'spinytails_master_packagings','spinytails_shipments',
    'spinytails_shipment_lots','spinytails_sanitation_checks',
    'spinytails_corrective_actions','spinytails_training_records',
    'spinytails_calibration_logs'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS p_%I_read   ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS p_%I_insert ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS p_%I_update ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS p_%I_delete ON %I;', t, t);

    EXECUTE format('CREATE POLICY p_%I_read   ON %I FOR SELECT TO authenticated USING (is_bsc_qc_staff());', t, t);
    EXECUTE format('CREATE POLICY p_%I_insert ON %I FOR INSERT TO authenticated WITH CHECK (is_bsc_qc_staff());', t, t);
    EXECUTE format('CREATE POLICY p_%I_update ON %I FOR UPDATE TO authenticated USING (is_bsc_qc_staff()) WITH CHECK (is_bsc_qc_staff());', t, t);
    EXECUTE format('CREATE POLICY p_%I_delete ON %I FOR DELETE TO authenticated USING (is_bsc_admin());', t, t);
  END LOOP;
END$$;

COMMIT;

-- =====================================================================
-- POST-MIGRATION NOTES
-- =====================================================================
-- 1. Lot Code generation: ALWAYS call spinytails_next_lot_code() before
--    inserting into spinytails_lots. Do not hand-type a lot code.
-- 2. CCP-5 (labeling) constraints REJECT inserts where any required
--    declaration is missing. This is intentional — it's a CCP.
-- 3. Inspector read-only role deferred to spinytails_audit_access
--    migration when /spinytails/audit endpoint is built.
-- 4. The full chain trace view (spinytails_lot_full_trace) is the
--    single query an inspector or recall investigation uses.
-- 5. Soft-delete only (is_active or status=rejected/recalled). Hard
--    deletes are restricted to is_bsc_admin() (founder/co_founder/
--    control_admin/basic_admin/manager).
-- =====================================================================

-- =====================================================================
-- VERIFY
-- =====================================================================

-- 1) All 14 tables present
SELECT 'tables_count:' AS check, COUNT(*) AS n
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'spinytails\_%' ESCAPE '\';

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'spinytails\_%' ESCAPE '\'
ORDER BY table_name;

-- 2) View exists
SELECT 'view_exists:' AS check, COUNT(*) AS n
FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'spinytails_lot_full_trace';

-- 3) Function exists
SELECT 'function_exists:' AS check, COUNT(*) AS n
FROM pg_proc WHERE proname = 'spinytails_next_lot_code';

-- 4) Seed vessels
SELECT vessel_code, fisherman_name, color_tag, status
FROM spinytails_vessels WHERE vessel_code IN ('AT','SP')
ORDER BY vessel_code;

-- 5) RLS enabled on all 14
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'spinytails\_%' ESCAPE '\'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 6) Smoke test — expect 'STPC-20260805-AT-01'
SELECT spinytails_next_lot_code('2026-08-05'::date, 'AT') AS smoke_test;
