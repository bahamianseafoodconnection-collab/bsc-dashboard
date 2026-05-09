-- BSC Dashboard - Yield Measurement schema additions
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Extends yield_lots with the post-processing measurement columns.
-- Lets us capture REAL measured output (not assumptions) per the
-- YIELD DISCIPLINE PRINCIPLE.
--
-- Intake row sets either whole_weight_lb (whole intake) OR
-- clean_weight_lb (tail intake). After processing at Spiny Tail, this
-- form sets finished_weight_lb, waste_weight_lb, output_breakdown,
-- processed_at, processed_by. true_cost_per_lb is recalculated from
-- cost_paid / finished_weight_lb at that point.

alter table public.yield_lots
  add column if not exists finished_weight_lb  numeric,
  add column if not exists waste_weight_lb     numeric,
  add column if not exists output_breakdown    jsonb,
  add column if not exists processed_at        timestamptz,
  add column if not exists processed_by        text,
  add column if not exists processing_notes    text;

create index if not exists yield_lots_pending_idx
  on public.yield_lots (processed_at)
  where processed_at is null;

create index if not exists yield_lots_processed_idx
  on public.yield_lots (processed_at desc)
  where processed_at is not null;
