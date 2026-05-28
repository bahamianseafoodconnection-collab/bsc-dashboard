-- =====================================================================
-- BSC Migration: 20260527190000_unit_type_sync_lb_decimal.sql
--
-- STICKY FIX for the recurring "lb products lose their decimal" bug
-- (re-fixed 3× before this — founder, 2026-05-27).
--
-- Root cause: products has TWO redundant unit columns —
--   * unit_of_measure  ← the source of truth. Edited by /admin/inventory
--                         spreadsheet, the Add-Product modal, and the seed.
--   * unit_type        ← read by /pos (is_per_lb) and /market (SaleUnit).
-- Nothing kept them equal, so every edit to unit_of_measure left
-- unit_type stale → POS/market silently reverted lb products to whole-unit
-- "each" behavior (no decimal weight entry).
--
-- Prior fixes were one-off UPDATEs, so the drift came right back. This
-- migration makes drift STRUCTURALLY IMPOSSIBLE via a trigger, so it can
-- never regress regardless of which surface writes the row.
--
-- Why a trigger and not a GENERATED column: the seed migrations and some
-- code paths explicitly write unit_type. A GENERATED ALWAYS column would
-- reject those INSERTs. A BEFORE trigger silently reconciles instead.
-- =====================================================================

BEGIN;

-- 1) One-time backfill: reconcile any existing drift.
--    If a row only ever had unit_type set (legacy), seed unit_of_measure
--    from it first; then force unit_type to match unit_of_measure.
UPDATE public.products
SET unit_of_measure = unit_type
WHERE unit_of_measure IS NULL AND unit_type IS NOT NULL;

UPDATE public.products
SET unit_type = COALESCE(unit_of_measure, 'each')
WHERE unit_type IS DISTINCT FROM COALESCE(unit_of_measure, 'each');

-- 2) Trigger function — runs on every INSERT/UPDATE, reconciles the pair.
--    unit_of_measure is authoritative; if a writer supplies only
--    unit_type, we backfill unit_of_measure from it. Either way the two
--    end up identical, and unit_type is never NULL.
CREATE OR REPLACE FUNCTION public.sync_unit_type_from_uom()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.unit_of_measure IS NULL AND NEW.unit_type IS NOT NULL THEN
    NEW.unit_of_measure := NEW.unit_type;
  END IF;
  NEW.unit_type := COALESCE(NEW.unit_of_measure, 'each');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_unit_type ON public.products;
CREATE TRIGGER trg_sync_unit_type
  BEFORE INSERT OR UPDATE OF unit_of_measure, unit_type
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_unit_type_from_uom();

-- 3) Verify: after the backfill no active product should be mismatched.
DO $pf$
DECLARE
  drift int;
BEGIN
  SELECT COUNT(*) INTO drift
  FROM public.products
  WHERE unit_type IS DISTINCT FROM COALESCE(unit_of_measure, 'each');
  IF drift > 0 THEN
    RAISE EXCEPTION 'unit_type still drifting on % product(s) after backfill', drift;
  END IF;
  RAISE NOTICE '✅ unit_type synced to unit_of_measure; trigger trg_sync_unit_type guards all future writes';
END $pf$;

COMMIT;
