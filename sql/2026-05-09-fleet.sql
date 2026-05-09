-- BSC Dashboard — fleet management schema (internal vehicles)
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Three tables:
--   fleet_vehicles       — BSC's own delivery vehicles, mailboats, etc.
--   fleet_maintenance    — service log per vehicle
--   fleet_fuel_logs      — fuel entries per vehicle
--
-- Distinct from public.vehicles which is the customer-facing sales/rental
-- marketplace. These three are operational only.

drop table if exists public.fleet_fuel_logs cascade;
drop table if exists public.fleet_maintenance cascade;
drop table if exists public.fleet_vehicles cascade;

create table public.fleet_vehicles (
  id                uuid          primary key default gen_random_uuid(),
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  name              text          not null,        -- "Delivery Van #1"
  make              text,
  model             text,
  year              integer,
  registration      text          unique,
  vehicle_type      text          not null default 'delivery_van'
                    check (vehicle_type in (
                      'delivery_van','pickup_truck','car','suv',
                      'mailboat','trailer','other'
                    )),
  status            text          not null default 'active'
                    check (status in ('active','maintenance','retired')),
  purchase_date     date,
  purchase_cost_bsd numeric(12,2),
  current_mileage   integer,
  notes             text
);

create index fleet_status_idx on public.fleet_vehicles (status);

create table public.fleet_maintenance (
  id               uuid          primary key default gen_random_uuid(),
  created_at       timestamptz   not null default now(),

  vehicle_id       uuid          not null references public.fleet_vehicles(id) on delete cascade,
  maintenance_type text          not null
                   check (maintenance_type in (
                     'oil_change','tire','brakes','engine','transmission',
                     'inspection','registration','insurance','repair','other'
                   )),
  description      text          not null,
  cost_bsd         numeric(12,2) not null check (cost_bsd >= 0),
  performed_at     timestamptz   not null default now(),
  mileage          integer,
  next_due_date    date,
  next_due_mileage integer,

  recorded_by      uuid,
  notes            text
);

create index fleet_maint_vehicle_idx     on public.fleet_maintenance (vehicle_id, performed_at desc);
create index fleet_maint_next_due_idx    on public.fleet_maintenance (next_due_date) where next_due_date is not null;

create table public.fleet_fuel_logs (
  id           uuid          primary key default gen_random_uuid(),
  created_at   timestamptz   not null default now(),

  vehicle_id   uuid          not null references public.fleet_vehicles(id) on delete cascade,
  gallons      numeric(8,2)  not null check (gallons > 0),
  cost_bsd     numeric(10,2) not null check (cost_bsd >= 0),
  mileage      integer,
  fueled_at    timestamptz   not null default now(),
  station      text,

  recorded_by  uuid,
  notes        text
);

create index fleet_fuel_vehicle_idx on public.fleet_fuel_logs (vehicle_id, fueled_at desc);

-- ─── RLS ───
alter table public.fleet_vehicles    enable row level security;
alter table public.fleet_maintenance enable row level security;
alter table public.fleet_fuel_logs   enable row level security;

drop policy if exists "fleet_vehicles_all_staff"    on public.fleet_vehicles;
drop policy if exists "fleet_maintenance_all_staff" on public.fleet_maintenance;
drop policy if exists "fleet_fuel_all_staff"        on public.fleet_fuel_logs;

create policy "fleet_vehicles_all_staff"
  on public.fleet_vehicles for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

create policy "fleet_maintenance_all_staff"
  on public.fleet_maintenance for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

create policy "fleet_fuel_all_staff"
  on public.fleet_fuel_logs for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));
