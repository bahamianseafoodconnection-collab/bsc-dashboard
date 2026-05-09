-- BSC Dashboard — financials table schema
-- Date: 2026-05-08
-- Run this once in the Supabase SQL editor.
--
-- Channel-aware sale accounting. lib/finance.ts inserts one row per recorded
-- sale via recordSaleFinancials(). Reads from getFinancialSummary() and the
-- dashboard aggregate the rows server-side.
--
-- Safe to re-run: drops and recreates. There is no production data here yet
-- because lib/finance.ts had no callers until commit 5226ad7.

drop table if exists public.financials cascade;

create table public.financials (
  id              uuid          primary key default gen_random_uuid(),
  created_at      timestamptz   not null default now(),

  -- Channel = the sacred-pricing-rule bucket this sale belongs to.
  -- Mirrors lib/finance.ts PricingChannel union exactly.
  channel         text          not null
                  check (channel in (
                    'nassau_pos',
                    'andros_pos',
                    'online_market',
                    'local_wholesale',
                    'us_resale',
                    'bill_payments',
                    'bill_casale'
                  )),

  -- Money amounts in BSD, two decimal places. All non-negative.
  revenue         numeric(12,2) not null check (revenue       >= 0),  -- customer paid
  profit          numeric(12,2) not null check (profit        >= 0),  -- BSC keeps (excl VAT)
  supplier_owed   numeric(12,2) not null check (supplier_owed >= 0),  -- supplier cost basis
  vat_collected   numeric(12,2) not null default 0
                                 check (vat_collected >= 0),          -- held for govt

  -- One row = one transaction by default. Aggregate writes can bump this.
  transactions    integer       not null default 1 check (transactions > 0),

  -- Optional link back to the originating order. Nullable so legacy callers
  -- that don't capture the order id can still log financials.
  order_id        uuid          references public.orders(id) on delete set null
);

-- Hot indexes: dashboard filters by channel + date, weekly reports scan by date.
create index financials_channel_created_idx on public.financials (channel, created_at desc);
create index financials_created_idx        on public.financials (created_at desc);

-- ─── Row-level security ───
-- Inserts are intentionally permissive: POS / checkout pages call this
-- fire-and-forget from the anon-key client, and we want to capture every
-- sale even from guest checkouts. Reads are restricted to active staff.

alter table public.financials enable row level security;

drop policy if exists "financials_insert_any"   on public.financials;
drop policy if exists "financials_select_staff" on public.financials;

create policy "financials_insert_any"
  on public.financials
  for insert
  with check (true);

create policy "financials_select_staff"
  on public.financials
  for select
  using (
    auth.uid() in (
      select id from public.users where is_active = true
    )
  );

-- ─── Quick verification ───
-- After running this file, sanity-check with:
--
--   select * from public.financials order by created_at desc limit 5;
--
-- (Will be empty until the next POS sale or checkout fires.)
