-- =====================================================================
-- BSC Migration: 20260526133000_add_frozen_meat_category.sql
--
-- Founder was blocked submitting "Seara whole chicken griller" at
-- /founder-ai/products/intake because the category 'frozen_meat' was
-- listed in the page dropdown but missing from the live product_category
-- enum — INSERT rejected with:
--   invalid input value for enum product_category: "frozen_meat"
--
-- Fix: add 'frozen_meat' to the enum. IF NOT EXISTS is idempotent so
-- re-running this migration is safe. Note: ALTER TYPE ADD VALUE cannot
-- run inside an explicit BEGIN/COMMIT transaction block in older
-- Postgres — Supabase SQL Editor autocommits, so this works as-is.
--
-- See also: feedback_verify_against_live_not_artifact.md — the page
-- listed frozen_meat artifact-side without the live enum supporting it.
-- Future category additions: enum first, dropdown second.
-- =====================================================================

ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'frozen_meat';
