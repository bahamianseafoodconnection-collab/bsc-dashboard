-- BSC migration 2026-06-21 — import "accept-all, normalize, flag — never drop"
-- Applied + verified live in the Supabase SQL Editor 2026-06-21.
-- Captured here for version control (live schema is the source of truth; see
-- docs/reference_schema_source_of_truth.md).

-- 1) Review-flag columns on products. Set by bulk-add-products when a unit (or
--    any field) is auto-normalized or defaulted, so the founder can verify the
--    flagged rows later instead of the row being rejected.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS needs_review  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

COMMENT ON COLUMN public.products.needs_review  IS
  'Set true by import when a unit/field was auto-normalized or defaulted; founder should verify.';
COMMENT ON COLUMN public.products.review_reason IS
  'Why needs_review was set, e.g. "unit ''CTN'' auto-mapped to ''case''".';

-- 2) Widen the unit_of_measure CHECK to the canonical set the import normalizes
--    to. This is a SUPERSET of the old set (lb,oz,kg,g,each,case,gallon,bottle,
--    pack) + bag,box,dozen — so every existing row stays valid. The route maps
--    messy units (ctn, ea, cs, tin, jar, can, bale, bdl, bundle, sleeve, carton)
--    onto these before insert, and defaults anything unrecognized to 'each' +
--    needs_review, so an insert can never bounce on the unit again.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_unit_of_measure_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_unit_of_measure_check
  CHECK (unit_of_measure = ANY (ARRAY[
    'lb','oz','kg','g','each','case','gallon','bottle','pack','bag','box','dozen'
  ]::text[]));
