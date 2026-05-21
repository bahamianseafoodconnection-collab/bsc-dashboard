-- Universal Inventory Intake — product_intake_log table + role/GPS columns.
--
-- One row per intake submission across every role. Photos + GPS metadata
-- stored as JSONB. Only Dedrick (founder/co_founder/control_admin) can
-- read or update; any authenticated user can INSERT their own submission.
-- Nothing writes to products until Dedrick approves at the queue.
--
-- Schema rationale:
--   • One unified table — every role's submissions land here, identified
--     by submitted_by_role. Avoids per-role tables.
--   • photo_geo is JSONB array, one element per photo (matches photo_urls
--     order). Element shape: { captured_at, latitude, longitude,
--     accuracy_meters, gps_status }.
--   • status enum keeps the approval lifecycle explicit.

CREATE TABLE IF NOT EXISTS product_intake_log (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  submitted_by        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_role   TEXT,
  submission_source   TEXT         NOT NULL DEFAULT 'web' CHECK (submission_source IN ('web','mobile','api')),
  raw_payload         JSONB        NOT NULL,
  photo_urls          TEXT[]       NOT NULL DEFAULT '{}',
  photo_geo           JSONB,
  proposed_sku        TEXT,
  proposed_name       TEXT,
  proposed_supplier_id UUID         REFERENCES suppliers(id) ON DELETE SET NULL,
  extracted_fields    JSONB,
  status              TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','superseded')),
  approved_at         TIMESTAMPTZ,
  approved_by         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_notes      TEXT,
  product_id          UUID         REFERENCES products(id) ON DELETE SET NULL,
  rejected_reason     TEXT
);

CREATE INDEX IF NOT EXISTS idx_intake_log_status_submitted
  ON product_intake_log (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_log_role
  ON product_intake_log (submitted_by_role, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_log_submitter
  ON product_intake_log (submitted_by);

ALTER TABLE product_intake_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can INSERT their own intake submission.
DROP POLICY IF EXISTS intake_log_self_insert ON product_intake_log;
CREATE POLICY intake_log_self_insert ON product_intake_log
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Submitter can read their own pending submissions back (so the form
-- can show "Thanks! Pending review — submitted at X" after submit).
DROP POLICY IF EXISTS intake_log_self_read ON product_intake_log;
CREATE POLICY intake_log_self_read ON product_intake_log
  FOR SELECT
  USING (submitted_by = auth.uid());

-- Admins (founder / co_founder / control_admin / basic_admin) can read
-- ALL submissions — that's the approval queue.
DROP POLICY IF EXISTS intake_log_admin_read ON product_intake_log;
CREATE POLICY intake_log_admin_read ON product_intake_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin','basic_admin')
    )
  );

-- Only Dedrick + Jaquel + control_admin + basic_admin can approve.
DROP POLICY IF EXISTS intake_log_admin_update ON product_intake_log;
CREATE POLICY intake_log_admin_update ON product_intake_log
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin','basic_admin')
    )
  );

COMMENT ON TABLE product_intake_log IS
  'Universal intake submission log — every role posts here (raw payload + photos + GPS), only admins approve, nothing writes to products until approval.';
COMMENT ON COLUMN product_intake_log.photo_geo IS
  'JSONB array, one element per photo (same order as photo_urls). Element: {captured_at, latitude, longitude, accuracy_meters, gps_status}. gps_status in (captured|denied|unavailable|timeout).';
