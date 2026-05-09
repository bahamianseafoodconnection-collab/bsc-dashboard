-- BSC Dashboard — payroll_entries table
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- One row per (staff member × pay period). Hourly or salaried — both
-- paths populate gross_pay. paid_at + payment_method + payment_ref
-- mirror the expenses pattern so AP works the same way.
--
-- When marked paid, the app also writes a matching expenses row in the
-- 'payroll' category linking back via related_supplier_id (we reuse
-- that nullable field for staff_user_id since no FK is enforced).

drop table if exists public.payroll_entries cascade;

create table public.payroll_entries (
  id                  uuid          primary key default gen_random_uuid(),
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),

  staff_user_id       uuid,                                -- references public.users(id)
  staff_name          text          not null,              -- denormalized for legacy lookup

  pay_period_start    date          not null,
  pay_period_end      date          not null,

  -- Either hourly path:
  hours               numeric(8,2)  check (hours is null or hours >= 0),
  hourly_rate         numeric(10,2) check (hourly_rate is null or hourly_rate >= 0),

  -- Or salaried path:
  salary_amount       numeric(12,2) check (salary_amount is null or salary_amount >= 0),

  -- Gross + deductions + net (always set on submit)
  gross_pay           numeric(12,2) not null check (gross_pay >= 0),
  deductions          numeric(12,2) not null default 0 check (deductions >= 0),
  net_pay             numeric(12,2) not null check (net_pay >= 0),

  paid_at             timestamptz,
  payment_method      text,
  payment_ref         text,

  notes               text,
  recorded_by         uuid
);

create index payroll_staff_idx       on public.payroll_entries (staff_user_id, pay_period_end desc) where staff_user_id is not null;
create index payroll_period_idx      on public.payroll_entries (pay_period_end desc);
create index payroll_unpaid_idx      on public.payroll_entries (pay_period_end desc) where paid_at is null;

alter table public.payroll_entries enable row level security;

drop policy if exists "payroll_all_staff" on public.payroll_entries;
create policy "payroll_all_staff"
  on public.payroll_entries for all
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));
