-- BSC Dashboard — customer addresses
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Lets a signed-in shopper save multiple delivery addresses (home, office,
-- shop, etc.) and pick a default. Used by /account and pre-fills /checkout.

create table if not exists public.customer_addresses (
  id              uuid          primary key default gen_random_uuid(),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  auth_user_id    uuid          not null,
  label           text,                             -- "Home", "Office", etc.
  recipient_name  text,
  phone           text,
  street          text          not null,
  island          text          not null default 'Nassau',
  notes           text,
  is_default      boolean       not null default false
);

create index if not exists customer_addresses_user_idx
  on public.customer_addresses (auth_user_id, is_default desc, created_at desc);

-- Only one default address per user. Partial unique index keeps the
-- constraint loose for legacy rows.
create unique index if not exists customer_addresses_one_default
  on public.customer_addresses (auth_user_id) where is_default = true;

alter table public.customer_addresses enable row level security;

drop policy if exists "addresses_select_own" on public.customer_addresses;
drop policy if exists "addresses_insert_own" on public.customer_addresses;
drop policy if exists "addresses_update_own" on public.customer_addresses;
drop policy if exists "addresses_delete_own" on public.customer_addresses;

create policy "addresses_select_own"
  on public.customer_addresses for select
  using (auth.uid() = auth_user_id);

create policy "addresses_insert_own"
  on public.customer_addresses for insert
  with check (auth.uid() is not null and auth.uid() = auth_user_id);

create policy "addresses_update_own"
  on public.customer_addresses for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy "addresses_delete_own"
  on public.customer_addresses for delete
  using (auth.uid() = auth_user_id);
