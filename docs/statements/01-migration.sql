-- =====================================================================
-- docs/statements/01-migration.sql
--
-- Weekly Customer Statement Generator — schema + storage.
-- Extends the existing credit_statements table with approval / PDF /
-- period / send state, and creates the private `statements` bucket.
--
-- Run once in the Supabase SQL editor. Idempotent.
-- =====================================================================

-- ── credit_statements: add approval + PDF + period + send columns ────
alter table public.credit_statements
  add column if not exists period_start      date,
  add column if not exists period_end        date,
  add column if not exists status            text not null default 'pending',
  add column if not exists trigger_reason    text not null default 'scheduled',
  add column if not exists pdf_path          text,
  add column if not exists total_invoiced    numeric,
  add column if not exists total_paid        numeric,
  add column if not exists account_status    text,
  add column if not exists customer_snapshot jsonb,
  add column if not exists approved_by       uuid,
  add column if not exists approved_at       timestamptz,
  add column if not exists sent_at           timestamptz,
  add column if not exists sent_channel      text,
  add column if not exists created_at        timestamptz not null default now();

-- Status / trigger guards (drop-and-add so re-runs don't error).
alter table public.credit_statements drop constraint if exists credit_statements_status_chk;
alter table public.credit_statements
  add constraint credit_statements_status_chk
  check (status in ('pending','approved','sent','void'));

alter table public.credit_statements drop constraint if exists credit_statements_trigger_chk;
alter table public.credit_statements
  add constraint credit_statements_trigger_chk
  check (trigger_reason in ('scheduled','credit_breach','manual'));

-- One live statement per customer per period (idempotent cron re-runs).
create unique index if not exists credit_statements_customer_period_key
  on public.credit_statements (customer_id, period_end)
  where status <> 'void';

-- ── RLS — staff read/manage; service role (cron/API) bypasses ────────
alter table public.credit_statements enable row level security;
drop policy if exists credit_statements_staff_all on public.credit_statements;
create policy credit_statements_staff_all on public.credit_statements
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Private storage bucket for the rendered PDFs ────────────────────
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

-- Staff may read/write statement PDFs; service role bypasses RLS.
drop policy if exists statements_read  on storage.objects;
create policy statements_read  on storage.objects
  for select using (bucket_id = 'statements' and public.is_staff());

drop policy if exists statements_write on storage.objects;
create policy statements_write on storage.objects
  for insert with check (bucket_id = 'statements' and public.is_staff());

drop policy if exists statements_update on storage.objects;
create policy statements_update on storage.objects
  for update using (bucket_id = 'statements' and public.is_staff());
