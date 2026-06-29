-- =====================================================================
-- docs/printing/01-migration.sql
--
-- Star CloudPRNT — printer registry + print-job queue.
--
-- The Star mC-Print3 (MCP31L) polls our public /api/cloudprnt endpoint
-- over HTTPS (outbound from the LAN). The endpoint runs as the service
-- role and bypasses RLS, so the printer's poll path needs no user token.
-- Staff (is_staff) can read/manage rows from the dashboard.
--
-- Run once in the Supabase SQL editor. Idempotent.
-- =====================================================================

-- ── Printer registry ────────────────────────────────────────────────
-- One row per physical unit. CloudPRNT identifies a printer by its MAC,
-- so MAC is the natural key. ip_address is informational (DHCP-reserved
-- to static on the router); the printer reaches us by the CloudPRNT URL
-- configured in its own web UI, not the other way around.
create table if not exists public.printers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  model               text,
  ip_address          text,
  mac_address         text not null,
  location            text,
  printable_width_mm  int  not null default 72,
  media_type          text not null default 'text/vnd.star.markup',
  cloudprnt_url       text,                          -- the URL set ON the printer (reference)
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
-- MAC is matched case-insensitively by the endpoint.
create unique index if not exists printers_mac_key on public.printers (lower(mac_address));

-- ── Print-job queue ─────────────────────────────────────────────────
-- POS "Print Receipt" inserts a pending job; the CloudPRNT endpoint
-- claims it on the next printer poll, serves the rendered markup, and
-- marks it printed on the printer's DELETE/confirm. payload is usually
-- NULL — the endpoint renders fresh Star Document Markup from order_id +
-- job_type at fetch time so the slip always reflects the current order.
-- A non-null payload is printed verbatim (raw/custom jobs).
create table if not exists public.print_jobs (
  id          uuid primary key default gen_random_uuid(),
  printer_id  uuid references public.printers(id) on delete set null,
  job_type    text not null default 'receipt'
              check (job_type in ('receipt','invoice','pick_ticket')),
  order_id    uuid,
  payload     text,
  copies      int  not null default 1,
  status      text not null default 'pending'
              check (status in ('pending','claimed','printed','failed')),
  error       text,
  claimed_at  timestamptz,
  printed_at  timestamptz,
  created_at  timestamptz not null default now()
);
-- Hot path: "next job for this printer".
create index if not exists print_jobs_queue_idx
  on public.print_jobs (printer_id, status, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.printers   enable row level security;
alter table public.print_jobs enable row level security;

-- Staff manage from the dashboard. The printer poll path uses the
-- service role (bypasses RLS), so no anon/public policy is needed.
drop policy if exists printers_staff_all on public.printers;
create policy printers_staff_all on public.printers
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists print_jobs_staff_all on public.print_jobs;
create policy print_jobs_staff_all on public.print_jobs
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Register the Nassau counter unit (idempotent) ───────────────────
-- mC-Print3 MCP31L · F/W Ver3.6 · 72mm printable · MAC 00:11:62:31:89:BC.
insert into public.printers (name, model, ip_address, mac_address, location, printable_width_mm)
select 'Nassau Counter', 'MCP31L', '192.168.50.199', '00:11:62:31:89:BC', 'Nassau counter', 72
where not exists (
  select 1 from public.printers where lower(mac_address) = lower('00:11:62:31:89:BC')
);
