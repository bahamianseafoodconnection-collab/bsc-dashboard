-- BSC Dashboard — promo codes + redemption tracking
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Three things:
--   1. promo_codes — the code definitions (BSC controls these from /promos)
--   2. promo_redemptions — one row per use of a code on an order
--   3. orders.promo_code + orders.promo_discount columns — what was applied
--
-- Discount math:
--   percent  → discount = round(subtotal * value/100, 2), capped at subtotal
--   fixed    → discount = min(value, subtotal)
--
-- Validation rules (enforced in /api/promos/validate):
--   - active = true
--   - now() between valid_from (or null) and valid_until (or null)
--   - subtotal >= min_subtotal (or min_subtotal is null)
--   - uses_count < max_uses (or max_uses is null)
--   - if single_use_per_customer: no prior redemption rows for this email/phone
--
-- single_use_per_customer is intentionally soft — checked client-side in the
-- API route, not a DB constraint, so guests without accounts can still use
-- different emails for separate orders. Real abuse mitigation needs auth.

-- ─── promo_codes ───────────────────────────────────────────────────
create table if not exists public.promo_codes (
  id                       uuid          primary key default gen_random_uuid(),
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),

  code                     text          not null,        -- stored uppercase
  description              text,

  discount_type            text          not null
                           check (discount_type in ('percent','fixed')),
  discount_value           numeric(10,2) not null check (discount_value > 0),

  min_subtotal             numeric(10,2),                 -- BSD; null = no min
  valid_from               timestamptz,
  valid_until              timestamptz,
  max_uses                 integer,                       -- null = unlimited
  uses_count               integer       not null default 0,
  single_use_per_customer  boolean       not null default false,
  active                   boolean       not null default true
);

create unique index if not exists promo_codes_code_uniq on public.promo_codes (upper(code));
create index if not exists promo_codes_active_idx       on public.promo_codes (active, valid_until);

alter table public.promo_codes enable row level security;

-- Anyone can SELECT active codes (the validate route is anon-readable);
-- mutations go through service-role on the admin page.
drop policy if exists "promo_codes_select_active" on public.promo_codes;
create policy "promo_codes_select_active"
  on public.promo_codes for select
  using (active = true);

-- ─── promo_redemptions ─────────────────────────────────────────────
create table if not exists public.promo_redemptions (
  id              uuid          primary key default gen_random_uuid(),
  created_at      timestamptz   not null default now(),

  promo_id        uuid          not null
                  references public.promo_codes(id) on delete cascade,
  promo_code      text          not null,                -- denormalized
  order_id        uuid,
  customer_id     uuid,
  customer_email  text,
  customer_phone  text,
  applied_amount  numeric(10,2) not null
);

create index if not exists promo_redemptions_promo_idx     on public.promo_redemptions (promo_id, created_at desc);
create index if not exists promo_redemptions_email_idx     on public.promo_redemptions (lower(customer_email));
create index if not exists promo_redemptions_phone_idx     on public.promo_redemptions (customer_phone);

alter table public.promo_redemptions enable row level security;
-- Server-only writes (service role).

-- ─── orders columns ────────────────────────────────────────────────
alter table public.orders
  add column if not exists promo_code     text,
  add column if not exists promo_discount numeric(10,2) not null default 0;

create index if not exists orders_promo_code_idx on public.orders (promo_code) where promo_code is not null;
