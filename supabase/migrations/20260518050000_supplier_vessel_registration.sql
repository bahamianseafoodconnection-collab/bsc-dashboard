-- Per-fisherman vessel + yearly government registration doc.
--
-- Rule (from the founder): a fisherman uploads their boat registration
-- ONCE per year when the government renewal is issued. That doc stays
-- attached to the supplier record (= fisherman + boat). Future intakes
-- on /lobster-intake auto-pull vessel info from the supplier — no need
-- to re-type vessel name + registration # for every receive.
--
-- 1:1 supplier ↔ vessel for now. Multi-boat support can extend later
-- with a separate vessels table; today every commercial fisherman in
-- BSC's pipeline runs one boat.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS vessel_name                    TEXT,
  ADD COLUMN IF NOT EXISTS vessel_registration_number     TEXT,
  ADD COLUMN IF NOT EXISTS vessel_owner_name              TEXT,
  ADD COLUMN IF NOT EXISTS vessel_captain_name            TEXT,
  ADD COLUMN IF NOT EXISTS vessel_registration_doc_url    TEXT,
  ADD COLUMN IF NOT EXISTS vessel_registration_year       INT,
  ADD COLUMN IF NOT EXISTS vessel_registration_expires_on DATE,
  ADD COLUMN IF NOT EXISTS vessel_registration_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vessel_registration_uploaded_by UUID;

CREATE INDEX IF NOT EXISTS suppliers_vessel_reg_year_idx
  ON suppliers (vessel_registration_year)
  WHERE vessel_registration_doc_url IS NOT NULL;

-- Verify
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'suppliers'
  AND column_name IN (
    'vessel_name','vessel_registration_number','vessel_owner_name',
    'vessel_captain_name','vessel_registration_doc_url',
    'vessel_registration_year','vessel_registration_expires_on',
    'vessel_registration_uploaded_at','vessel_registration_uploaded_by'
  )
ORDER BY column_name;
