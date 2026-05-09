-- BSC Dashboard — Traceability schema (captains, vessels, batch outputs)
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Adds three pieces:
--   1. captains      — every fisherman / boat owner BSC sources from
--   2. vessels       — boats they operate (one captain may have several)
--   3. processing_batch_outputs — per-SKU breakdown of a processing batch
--      (one batch -> many outputs; e.g. one grouper batch yields steaks,
--      head, loin, loss). Lets cost basis be allocated per output.
--
-- Existing schema NOT modified. yield_lots already carries captain_name +
-- vessel_reg as text; this just normalises that into proper rows so we can
-- aggregate "total bought from captain X" cleanly.

-- ─── captains ──────────────────────────────────────────────────────
drop table if exists public.captains cascade;

create table public.captains (
  id              uuid          primary key default gen_random_uuid(),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  name            text          not null,
  phone           text          unique,
  email           text,
  whatsapp_number text,
  notes           text,

  -- Tracking aggregates (kept fresh by app code, not triggers, for portability)
  total_deliveries  integer       not null default 0 check (total_deliveries >= 0),
  total_lbs         numeric(12,2) not null default 0 check (total_lbs        >= 0),
  total_paid_bsd    numeric(12,2) not null default 0 check (total_paid_bsd   >= 0),
  last_delivery_at  timestamptz
);

create index captains_name_idx          on public.captains (name);
create index captains_last_delivery_idx on public.captains (last_delivery_at desc nulls last);

-- ─── vessels ──────────────────────────────────────────────────────
drop table if exists public.vessels cascade;

create table public.vessels (
  id           uuid          primary key default gen_random_uuid(),
  created_at   timestamptz   not null default now(),

  captain_id   uuid          references public.captains(id) on delete set null,
  name         text          not null,         -- "Sea Queen"
  registration text          unique,           -- "BS-1234" — unique when set
  notes        text
);

create index vessels_captain_id_idx on public.vessels (captain_id);

-- ─── processing_batch_outputs (multi-output detail) ───────────────
drop table if exists public.processing_batch_outputs cascade;

create table public.processing_batch_outputs (
  id                          uuid          primary key default gen_random_uuid(),
  created_at                  timestamptz   not null default now(),

  -- Parent batch — one row per finished SKU within that batch
  processing_batch_id         uuid          not null
                              references public.processing_batches(id) on delete cascade,

  -- The finished product (e.g. "Grouper steak 6oz" — must exist in products)
  product_id                  uuid
                              references public.products(id) on delete set null,

  output_label                text          not null,                  -- free text fallback if no product_id
  output_weight_lbs           numeric(12,2) not null check (output_weight_lbs >= 0),

  -- Cost share — what fraction of the raw_cost_total is allocated here.
  -- Computed by app code (equal-weight, value-allocated, or manual override).
  cost_share_pct              numeric(6,3)  not null default 0
                              check (cost_share_pct >= 0 and cost_share_pct <= 100),
  allocated_cost_bsd          numeric(12,2) not null check (allocated_cost_bsd >= 0),
  effective_cost_per_lb       numeric(12,4) not null check (effective_cost_per_lb >= 0),

  -- Optional channel pricing snapshot at processing time
  nassau_price_per_lb         numeric(12,2),
  andros_price_per_lb         numeric(12,2),
  online_price_per_lb         numeric(12,2),
  wholesale_price_per_lb      numeric(12,2),

  notes                       text
);

create index pbo_batch_idx   on public.processing_batch_outputs (processing_batch_id);
create index pbo_product_idx on public.processing_batch_outputs (product_id);

-- ─── Optional: link processing_batches → captain/vessel ────────────
alter table public.processing_batches
  add column if not exists source_captain_id uuid,
  add column if not exists source_vessel_id  uuid;

create index if not exists pb_captain_idx on public.processing_batches (source_captain_id) where source_captain_id is not null;
create index if not exists pb_vessel_idx  on public.processing_batches (source_vessel_id)  where source_vessel_id  is not null;

-- ─── Row-level security ───
-- Same pattern as the other staff tables: insert/update/select gated to
-- active staff via users.is_active.

alter table public.captains                  enable row level security;
alter table public.vessels                   enable row level security;
alter table public.processing_batch_outputs  enable row level security;

drop policy if exists "captains_all_staff"  on public.captains;
drop policy if exists "vessels_all_staff"   on public.vessels;
drop policy if exists "pbo_all_staff"       on public.processing_batch_outputs;

create policy "captains_all_staff"
  on public.captains for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

create policy "vessels_all_staff"
  on public.vessels for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

create policy "pbo_all_staff"
  on public.processing_batch_outputs for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

-- ─── Verification ───
--   select count(*) from public.captains;                 -- 0
--   select count(*) from public.vessels;                  -- 0
--   select count(*) from public.processing_batch_outputs; -- 0
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='processing_batches'
--       and column_name in ('source_captain_id','source_vessel_id'); -- 2 rows
