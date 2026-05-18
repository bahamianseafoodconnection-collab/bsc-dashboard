-- FDA-compliant label fields + LOT CODE generator.
--
-- The Spiny Tails Co. lobster label needs:
--   SPINY LOBSTER TAILS
--   (Panulirus Argus)
--   Spiny Tails Processing Co.
--   Firetrail Road, New Providence, The Bahamas
--   FDA # 16988725790, Processing Plant 45
--   Ingredients: Lobster Tails, Sodium Bisulfite added as a Preservative
--   LOT CODE: 2025/0074
--   Packed By: December, 2025
--   Best Used by: December, 2027
--   SEAFOOD IS AN ALLERGEN
--   WILD CAUGHT PRODUCT OF THE BAHAMAS

ALTER TABLE traceability_batches
  ADD COLUMN IF NOT EXISTS lot_code                TEXT,        -- YYYY/NNNN, auto on approve
  ADD COLUMN IF NOT EXISTS fda_number              TEXT,
  ADD COLUMN IF NOT EXISTS processing_plant_number TEXT,
  ADD COLUMN IF NOT EXISTS ingredients             TEXT,
  ADD COLUMN IF NOT EXISTS wild_caught             BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS traceability_batches_lot_code_uniq
  ON traceability_batches (lot_code) WHERE lot_code IS NOT NULL;

-- ─── LOT CODE generator ──────────────────────────────────────────
-- Format: YYYY/NNNN — N is the per-year sequence across all batches.
-- Padded to 4 digits to match the regulator-friendly format on the
-- reference label.

CREATE OR REPLACE FUNCTION generate_lot_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  yr  TEXT := to_char(NOW() AT TIME ZONE 'America/Nassau', 'YYYY');
  n   INT;
BEGIN
  SELECT COUNT(*) + 1 INTO n
  FROM traceability_batches
  WHERE lot_code LIKE yr || '/%';
  RETURN yr || '/' || LPAD(n::text, 4, '0');
END;
$$;

-- ─── Public trace function — re-create with new columns ──────────
DROP FUNCTION IF EXISTS get_public_trace(TEXT);
CREATE FUNCTION get_public_trace(p_batch_number TEXT)
RETURNS TABLE (
  batch_number             TEXT,
  lot_code                 TEXT,
  product_name             TEXT,
  scientific_name          TEXT,
  vendor_type              TEXT,
  business_name            TEXT,
  location                 TEXT,
  vessel_registration      TEXT,
  farm_license_number      TEXT,
  production_date          DATE,
  expiry_date              DATE,
  allergens                TEXT,
  cook_disclaimer          TEXT,
  ingredients              TEXT,
  fda_number               TEXT,
  processing_plant_number  TEXT,
  wild_caught              BOOLEAN,
  approved_at              TIMESTAMPTZ,
  processed_at             TIMESTAMPTZ,
  phases                   JSONB
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.batch_number,
    b.lot_code,
    b.product_name,
    b.scientific_name,
    b.vendor_type,
    v.business_name,
    v.location,
    b.vessel_registration,
    b.farm_license_number,
    b.production_date,
    b.expiry_date,
    b.allergens,
    b.cook_disclaimer,
    b.ingredients,
    b.fda_number,
    b.processing_plant_number,
    b.wild_caught,
    b.approved_at,
    b.processed_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'phase_number', tp.phase_number,
          'phase_label',  tp.phase_label,
          'media_type',   tp.media_type,
          'media_url',    tp.media_url,
          'latitude',     tp.latitude,
          'longitude',    tp.longitude,
          'captured_at',  tp.captured_at
        ) ORDER BY tp.phase_number)
       FROM traceability_phases tp WHERE tp.listing_id = b.listing_id),
      '[]'::jsonb
    ) AS phases
  FROM traceability_batches b
  JOIN vendors v ON v.id = b.vendor_id
  WHERE (b.batch_number = p_batch_number OR b.lot_code = p_batch_number)
    AND b.status IN ('processed','at_processing','pending_processing');
$$;

GRANT EXECUTE ON FUNCTION get_public_trace(TEXT) TO anon, authenticated;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'traceability_batches'
  AND column_name IN ('lot_code','fda_number','processing_plant_number','ingredients','wild_caught')
ORDER BY column_name;
