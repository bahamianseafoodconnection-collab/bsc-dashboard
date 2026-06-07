-- 20260607010000_products_vat_code_allow_f.sql
--
-- Relax products.vat_code CHECK constraint to allow 'F' (5% VAT).
-- BWA seed (20260516130000_bwa_seed_phase1.sql) originally allowed only
-- X (0%) and T (10%). F (5%) is required for items like diapers, wipes,
-- and feminine pads — confirmed by founder 2026-06-07.
--
-- Keeps the same constraint name (products_vat_code_check) so any code
-- referencing it doesn't drift. No data change, no default change —
-- existing rows (all 'X' or 'T') remain valid under the broader check.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_vat_code_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_vat_code_check
  CHECK (vat_code IN ('X','T','F'));
