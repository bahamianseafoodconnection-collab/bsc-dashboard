-- Product label fields + a public-safe traceability function.
--
-- ALLERGENS: plain-language allergen line for the printed label
--   (e.g. "Contains shellfish.")
-- COOK_DISCLAIMER: e.g. "Cook fully before consumption."
-- PRODUCT_LABEL_URL: optional cached label PDF/PNG URL (future)
--
-- GET_PUBLIC_TRACE(batch_number) — SECURITY DEFINER function the public
-- /trace/[batch_number] page calls. Returns only safe, customer-facing
-- traceability info. Vessel/farm context is partially redacted (we keep
-- the registration number but never the captain's or owner's name).

ALTER TABLE traceability_batches
  ADD COLUMN IF NOT EXISTS allergens         TEXT,
  ADD COLUMN IF NOT EXISTS cook_disclaimer   TEXT,
  ADD COLUMN IF NOT EXISTS product_label_url TEXT;

-- ─── Public trace function ─────────────────────────────────────────
DROP FUNCTION IF EXISTS get_public_trace(TEXT);
CREATE FUNCTION get_public_trace(p_batch_number TEXT)
RETURNS TABLE (
  batch_number        TEXT,
  product_name        TEXT,
  scientific_name     TEXT,
  vendor_type         TEXT,
  business_name       TEXT,
  location            TEXT,
  vessel_registration TEXT,
  farm_license_number TEXT,
  production_date     DATE,
  expiry_date         DATE,
  allergens           TEXT,
  cook_disclaimer     TEXT,
  approved_at         TIMESTAMPTZ,
  processed_at        TIMESTAMPTZ,
  phases              JSONB
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.batch_number,
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
  WHERE b.batch_number = p_batch_number
    AND b.status IN ('processed','at_processing','pending_processing');
$$;

GRANT EXECUTE ON FUNCTION get_public_trace(TEXT) TO anon, authenticated;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name='traceability_batches'
  AND column_name IN ('allergens','cook_disclaimer','product_label_url')
ORDER BY column_name;
