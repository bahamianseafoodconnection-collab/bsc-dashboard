-- =====================================================================
-- docs/spinytails/03-cites-quota.sql   (G17 — CITES export quota)
--
-- Tracks lobster export against the CITES ceiling. Each row is a founder-set
-- ceiling for a species + season; "used" is computed live from
-- spinytails_shipments weight in the period (not stored).
--
-- Uses bsc_is_internal_staff() (created in G1a) for RLS. Idempotent.
-- =====================================================================

create table if not exists public.quota_tracking (
  id            uuid primary key default gen_random_uuid(),
  species_code  text not null default 'spiny_lobster',
  period_label  text,
  period_start  date not null,
  period_end    date not null,
  ceiling_lbs   numeric not null,
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists quota_tracking_species_period_key
  on public.quota_tracking (species_code, period_start, period_end);

alter table public.quota_tracking enable row level security;
drop policy if exists quota_tracking_staff_all on public.quota_tracking;
create policy quota_tracking_staff_all on public.quota_tracking
  for all using (public.bsc_is_internal_staff()) with check (public.bsc_is_internal_staff());
