-- =====================================================================
-- docs/expenses/01-migration.sql   (G2 + G3 — expense photo + approval)
--
-- Adds the receipt photo + founder-approval state to expenses so the
-- cashier "photo of receipt → expense" flow can land as PENDING and the
-- founder can approve/reject it before it counts in accounting.
--
-- status defaults to 'approved' so EXISTING rows + trusted direct entries
-- (founder/manager via /api/finance/record-expense) are grandfathered;
-- the capture path explicitly inserts 'pending_approval'.
--
-- expenses already has RLS (founder-only SELECT) + service-role writes;
-- no policy change needed here. Idempotent.
-- =====================================================================

alter table public.expenses
  add column if not exists image_url    text,
  add column if not exists status       text not null default 'approved',
  add column if not exists approved_by  uuid,
  add column if not exists approved_at  timestamptz;

alter table public.expenses drop constraint if exists expenses_status_chk;
alter table public.expenses
  add constraint expenses_status_chk
  check (status in ('pending_approval','approved','rejected'));

create index if not exists expenses_status_idx
  on public.expenses (status, created_at desc);
