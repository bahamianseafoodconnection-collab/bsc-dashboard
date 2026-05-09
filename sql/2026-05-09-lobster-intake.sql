-- BSC Dashboard - Lobster Intake schema additions
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Extends the existing yield_lots table to support both Strategy A
-- (buy whole) and Strategy B (buy tails) sourcing paths, plus the
-- Family Island origin tracking we need for traceability + USA
-- export compliance.
--
-- All columns added with IF NOT EXISTS so re-running is safe and
-- so existing yield_lots rows are unaffected.

alter table public.yield_lots
  add column if not exists source_type            text,
  add column if not exists size_grade_breakdown   jsonb,
  add column if not exists island_source          text,
  add column if not exists received_date          date,
  add column if not exists intake_notes           text,
  add column if not exists supplier_id            uuid references public.suppliers(id) on delete set null;

create index if not exists yield_lots_supplier_idx on public.yield_lots (supplier_id, received_date desc);
create index if not exists yield_lots_received_idx on public.yield_lots (received_date desc);
