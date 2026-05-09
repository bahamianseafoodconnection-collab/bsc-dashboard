-- BSC Dashboard — expenses table
-- Date: 2026-05-08
-- Run this once in the Supabase SQL editor.
--
-- Captures every operational expense outside the POS sale flow:
-- utilities, rent, payroll, supplier payments (off-PO), maintenance,
-- supplies, transport, fees, etc. Used by /expenses (entry + list)
-- and /accounts-payable (unpaid + due-date sorted).

drop table if exists public.expenses cascade;

create table public.expenses (
  id                  uuid          primary key default gen_random_uuid(),
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),

  description         text          not null,

  category            text          not null
                      check (category in (
                        'utilities',
                        'rent',
                        'payroll',
                        'supplier_payment',
                        'maintenance',
                        'supplies',
                        'transport',
                        'fees',
                        'marketing',
                        'equipment',
                        'taxes',
                        'other'
                      )),

  -- Who's owed. Free text so you can record one-off vendors without
  -- pre-creating a supplier row.
  vendor              text,

  amount_bsd          numeric(12,2) not null check (amount_bsd >= 0),

  -- When payment is due. Null = ad-hoc / paid immediately at entry time.
  due_date            date,

  -- When actually paid. Null = still outstanding (shows up in /accounts-payable).
  paid_at             timestamptz,
  payment_method      text,
  payment_ref         text,

  -- Optional linkage back to other tables. Both nullable.
  related_po_id       uuid,
  related_supplier_id uuid,

  -- For recurring expenses (rent, salaries, BPL). Display hint, not enforced.
  recurring_interval  text
                      check (recurring_interval is null or recurring_interval in (
                        'weekly','biweekly','monthly','quarterly','yearly'
                      )),

  recorded_by         uuid,         -- staff user id
  notes               text
);

create index expenses_due_date_idx     on public.expenses (due_date)            where paid_at is null;
create index expenses_paid_at_idx      on public.expenses (paid_at desc)        where paid_at is not null;
create index expenses_category_idx     on public.expenses (category, created_at desc);
create index expenses_vendor_idx       on public.expenses (vendor)              where vendor is not null;
create index expenses_related_po_idx   on public.expenses (related_po_id)       where related_po_id is not null;

-- ─── Row-level security ───
-- Insert/update for authenticated active staff. Read same.

alter table public.expenses enable row level security;

drop policy if exists "expenses_insert_staff" on public.expenses;
drop policy if exists "expenses_update_staff" on public.expenses;
drop policy if exists "expenses_select_staff" on public.expenses;

create policy "expenses_insert_staff"
  on public.expenses for insert
  with check (
    auth.uid() in (select id from public.users where is_active = true)
  );

create policy "expenses_update_staff"
  on public.expenses for update
  using (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

create policy "expenses_select_staff"
  on public.expenses for select
  using (auth.uid() in (select id from public.users where is_active = true));

-- ─── Quick verification ───
--   select count(*) from public.expenses;     -- 0 initially
--
-- Try inserting via /expenses page after this migration runs.
