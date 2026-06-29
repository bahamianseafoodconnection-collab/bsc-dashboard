-- =====================================================================
-- docs/spinytails/02-receiving-fields.sql   (G14 — processor receiving)
--
-- Adds the receiving fields from the founder spec that weren't already on
-- spinytails_lot_intakes:
--   • reject_ratio_pct   — % rejects per bag at receiving
--   • harvest_positions  — 3–4 GPS positions where the catch was taken
--
-- (Sulfite is already captured via the CCP-1 inspection — qc_results.sulfite_ppm,
--  validated against the species limit; vessel color tag is surfaced from
--  spinytails_vessels.color_tag. No change needed for those.)
--
-- Idempotent. Run in the Supabase SQL editor.
-- =====================================================================

alter table public.spinytails_lot_intakes
  add column if not exists reject_ratio_pct  numeric,
  add column if not exists harvest_positions jsonb;
