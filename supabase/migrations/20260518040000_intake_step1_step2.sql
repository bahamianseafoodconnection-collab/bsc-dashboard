-- Intake Step 1 (door receive) + Step 2 (production) + Step 3 (case
-- packing & rejections) field additions for the lobster pipeline.
--
-- /lobster-intake captures Step 1: vessel info + GPS-stamped photos at
-- the receiving door. Once admin approves, the same record flows into
-- /dashboard/processing-batches for Step 2 (freezer position, raw →
-- finished, production + expiry) and Step 3 (per-size case packing,
-- rejected items with notes — final traceability snapshot).

-- ─── Step 1 fields on yield_lots ──────────────────────────────────
ALTER TABLE yield_lots
  ADD COLUMN IF NOT EXISTS vessel_name              TEXT,
  ADD COLUMN IF NOT EXISTS vessel_registration      TEXT,
  ADD COLUMN IF NOT EXISTS intake_photos            TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_videos            TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_latitude          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS intake_longitude         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS intake_gps_accuracy_m    NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS intake_captured_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_status          TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by              UUID,
  ADD COLUMN IF NOT EXISTS approved_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes           TEXT,
  ADD COLUMN IF NOT EXISTS batch_id                 UUID
                          REFERENCES traceability_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS yield_lots_approval_idx ON yield_lots (approval_status);
CREATE INDEX IF NOT EXISTS yield_lots_batch_idx    ON yield_lots (batch_id) WHERE batch_id IS NOT NULL;

-- ─── Step 2 + Step 3 fields on traceability_batches ───────────────
ALTER TABLE traceability_batches
  -- Step 2: where the product lives, gross rejection weight
  ADD COLUMN IF NOT EXISTS freezer_position       TEXT,           -- e.g. "A-3-2" (row-shelf-slot)
  ADD COLUMN IF NOT EXISTS rejected_weight_lbs    NUMERIC(10,2),
  -- Step 3: case-pack breakdown + line-item rejection notes
  -- case_size_breakdown shape:
  --   { "5oz":  { "ten_lb": 2, "forty_lb": 1 },
  --     "6oz":  { "ten_lb": 0, "forty_lb": 3 }, ... }
  ADD COLUMN IF NOT EXISTS case_size_breakdown    JSONB,
  -- rejection_items shape:
  --   [ { "size": "8oz", "weight_lbs": 2.4, "reason": "shell damage" }, ... ]
  ADD COLUMN IF NOT EXISTS rejection_items        JSONB,
  ADD COLUMN IF NOT EXISTS rejection_notes        TEXT;

-- Verify
SELECT
  column_name
FROM information_schema.columns
WHERE table_name = 'yield_lots'
  AND column_name IN (
    'vessel_name','vessel_registration','intake_photos','intake_videos',
    'intake_latitude','intake_longitude','intake_gps_accuracy_m','intake_captured_at',
    'approval_status','approved_by','approved_at','approval_notes','batch_id'
  )
ORDER BY column_name;

SELECT
  column_name
FROM information_schema.columns
WHERE table_name = 'traceability_batches'
  AND column_name IN (
    'freezer_position','rejected_weight_lbs',
    'case_size_breakdown','rejection_items','rejection_notes'
  )
ORDER BY column_name;
