-- BSC Dashboard - Igloo Express Integration schema
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Three tables track BSC's full lobster pipeline AT Igloo Miami:
--
-- 1. igloo_shipments       - each cooler/air shipment from Spiny Tail
--                            (Nassau) to Igloo (Miami). Tracks freight
--                            forwarder cost, total weight, status, and
--                            optional Igloo advance financing payment.
--
-- 2. igloo_shipment_lots   - join: which yield_lots are in each shipment.
--                            Lets BSC pick batches by lot # at ship time.
--
-- 3. igloo_sales           - each sale Igloo executes on BSC's behalf
--                            (to global buyers). Tracks buyer, gross,
--                            Igloo commission, processing fee, storage,
--                            and net to BSC.

create table if not exists public.igloo_shipments (
  id                          uuid          primary key default gen_random_uuid(),
  created_at                  timestamptz   not null default now(),
  updated_at                  timestamptz   not null default now(),

  shipment_date               date          not null default current_date,
  freight_forwarder           text,                            -- Ship X / King Ocean / Tropical Shipping
  freight_cost_usd            numeric(10,2),
  cooler_count                integer,
  total_weight_lb             numeric(10,2) not null,
  total_cost_basis_bsd        numeric(10,2),                   -- BSC's cost (sum cost_paid)

  status                      text          not null default 'in_transit'
                              check (status in ('in_transit','received','sold_out','partial_sold','returned')),

  igloo_advance_amount_usd    numeric(10,2),                   -- if Igloo paid upfront at door
  igloo_advance_received_at   timestamptz,

  notes                       text
);

create index if not exists igloo_shipments_date_idx on public.igloo_shipments (shipment_date desc);
create index if not exists igloo_shipments_status_idx on public.igloo_shipments (status);

-- ─── shipment-lot join ─────────────────────────────────────────────
create table if not exists public.igloo_shipment_lots (
  id                          uuid          primary key default gen_random_uuid(),
  created_at                  timestamptz   not null default now(),

  shipment_id                 uuid          not null
                              references public.igloo_shipments(id) on delete cascade,
  yield_lot_id                uuid          references public.yield_lots(id) on delete set null,
  weight_lb_shipped           numeric(10,2) not null
);

create index if not exists igloo_ship_lots_shipment_idx on public.igloo_shipment_lots (shipment_id);
create index if not exists igloo_ship_lots_lot_idx on public.igloo_shipment_lots (yield_lot_id);

-- ─── sales executed by Igloo ───────────────────────────────────────
create table if not exists public.igloo_sales (
  id                          uuid          primary key default gen_random_uuid(),
  created_at                  timestamptz   not null default now(),
  updated_at                  timestamptz   not null default now(),

  sale_date                   date          not null default current_date,
  shipment_id                 uuid          references public.igloo_shipments(id) on delete set null,

  buyer_name                  text          not null,
  buyer_country               text          default 'USA',
  product                     text,                            -- e.g. "Lobster Tail #1 6oz"

  weight_lb                   numeric(10,2) not null,
  price_per_lb_usd            numeric(10,2) not null,
  gross_usd                   numeric(10,2) not null,

  igloo_commission_pct        numeric(5,2),                    -- e.g. 10
  igloo_commission_usd        numeric(10,2),
  igloo_processing_fee_usd    numeric(10,2),                   -- $1.75/lb baseline
  igloo_storage_alloc_usd     numeric(10,2),                   -- pro-rated storage
  net_to_bsc_usd              numeric(10,2),

  notes                       text
);

create index if not exists igloo_sales_date_idx on public.igloo_sales (sale_date desc);
create index if not exists igloo_sales_shipment_idx on public.igloo_sales (shipment_id);
create index if not exists igloo_sales_buyer_idx on public.igloo_sales (buyer_name);
