-- BSC Dashboard — customers table + orders.customer_id FK
-- Date: 2026-05-08
-- Run this once in the Supabase SQL editor.
--
-- Every named POS sale and every online registration upserts into this
-- table. Phone is the dedup key (unique when set). auth_user_id links
-- back to a registered online account. total_orders + total_spent_bsd
-- are denormalized for fast dashboard queries; the upsert endpoint keeps
-- them in sync.

drop table if exists public.customers cascade;

create table public.customers (
  id               uuid          primary key default gen_random_uuid(),
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),

  name             text          not null,
  phone            text          unique,                -- enforced unique when set
  email            text,
  auth_user_id     uuid,                                -- references auth.users(id), no FK to keep schema cross-project portable

  source           text          not null default 'manual'
                   check (source in ('pos_nassau','pos_andros','online','manual')),

  first_seen_at    timestamptz   not null default now(),
  last_seen_at     timestamptz   not null default now(),
  total_orders     integer       not null default 0 check (total_orders >= 0),
  total_spent_bsd  numeric(12,2) not null default 0 check (total_spent_bsd >= 0),

  notes            text
);

create index customers_phone_idx        on public.customers (phone)         where phone is not null;
create index customers_auth_user_id_idx on public.customers (auth_user_id)  where auth_user_id is not null;
create index customers_last_seen_idx    on public.customers (last_seen_at desc);

-- Link orders to customers. Nullable so guest / walk-in orders without a
-- recorded name keep working unchanged.
alter table public.orders
  add column if not exists customer_id uuid;

-- (We don't add a hard FK constraint here because the orders table already
-- has a lot of references and we want this migration to apply cleanly even
-- if a referenced customer row is later deleted. The customers table itself
-- never deletes — we just stop visiting them.)
create index if not exists orders_customer_id_idx
  on public.orders (customer_id) where customer_id is not null;

-- ─── Row-level security ───
-- Inserts/updates permissive so POS, checkout, and signup can fire writes
-- from the anon-key client. Reads restricted to active staff.

alter table public.customers enable row level security;

drop policy if exists "customers_insert_any"   on public.customers;
drop policy if exists "customers_update_any"   on public.customers;
drop policy if exists "customers_select_staff" on public.customers;

create policy "customers_insert_any"
  on public.customers for insert
  with check (true);

create policy "customers_update_any"
  on public.customers for update
  using (true) with check (true);

create policy "customers_select_staff"
  on public.customers for select
  using (
    auth.uid() in (
      select id from public.users where is_active = true
    )
  );

-- ─── Quick verification ───
-- After running:
--   select count(*) from public.customers;       -- 0 rows initially
--   select column_name, data_type from information_schema.columns
--     where table_name='orders' and column_name='customer_id';  -- should show 1 row
