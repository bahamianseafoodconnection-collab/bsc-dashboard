-- =====================================================================
-- Spiny Tails cold-chain — SLICE 1: SCHEMA
-- Extends the existing 22-table HACCP system. NO duplicate tables:
--   fishermen registry  = spinytails_vessels (extended here)
--   defrost/freezer temp = spinytails_temperature_logs (thaw_vat / blast / distribution)
--   processing stages    = spinytails_processing_steps / _batches
--   grading              = spinytails_batch_grades (lobster_grade enum, kept)
-- NEW here: per-box cases, barcode inventory, receiving-QC flags,
--   SSOP checklist, Fisheries packets, conch quota rollup, vessel certs.
-- Lot code STPC-YYYYMMDD-VV-NN via spinytails_next_lot_code() — unchanged.
-- Run once in the Supabase SQL editor. Idempotent; single transaction.
-- =====================================================================

begin;

-- 1) FISHERMEN REGISTRY — extend spinytails_vessels (canonical, FK'd by lots)
--    access_type: 'partner' = supplier-portal access (same portal as JBI/BWA);
--                 'direct'  = no portal. cert_needs_review = manual cert flag.
alter table public.spinytails_vessels
  add column if not exists captain_name            text,
  add column if not exists registration_cert_url   text,
  add column if not exists registration_expires_on date,
  add column if not exists access_type             text not null default 'direct',
  add column if not exists cert_needs_review        boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'spinytails_vessels_access_type_chk') then
    alter table public.spinytails_vessels
      add constraint spinytails_vessels_access_type_chk check (access_type in ('partner','direct'));
  end if;
end $$;

-- 2) SPECIES — per-species shelf life (Best Used By = date_pulled + months)
alter table public.spinytails_species
  add column if not exists shelf_life_months integer not null default 24;

-- 3) LOTS — pull clock, color tie-strap, certs, holding location
alter table public.spinytails_lots
  add column if not exists date_pulled              timestamptz,
  add column if not exists best_used_by             date,
  add column if not exists color_strap              text,
  add column if not exists color_strap_reused       boolean not null default false,
  add column if not exists cites_cert_no            text,
  add column if not exists inspection_cert_no       text,
  add column if not exists holding_freezer_location text;

-- 4) RECEIVING QC — the Fisheries "Receiving Log" Y/N flags
create table if not exists public.spinytails_receiving_qc (
  id                  uuid primary key default gen_random_uuid(),
  lot_id              uuid not null references public.spinytails_lots(id) on delete cascade,
  vessel_id           uuid references public.spinytails_vessels(id),
  time_received       timestamptz not null default now(),
  product_type        text,                       -- 'lobster' | 'conch'
  product_state       text,                       -- 'fresh' | 'frozen'
  core_surface_temp_f numeric,
  egg_bearing         boolean not null default false,
  discoloration       boolean not null default false,
  softshell_damage    boolean not null default false,
  undersized          boolean not null default false,
  odor                boolean not null default false,
  weight_lbs          numeric,
  lot_bag_no          text,
  recorded_by         uuid,
  initials            text,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists spinytails_receiving_qc_lot_idx on public.spinytails_receiving_qc(lot_id);

-- 5) CASES — individual finished boxes (per-box traceability + shipping)
create table if not exists public.spinytails_cases (
  id                 uuid primary key default gen_random_uuid(),
  lot_id             uuid not null references public.spinytails_lots(id) on delete restrict,
  case_code          text not null unique,
  product_type       text not null,              -- 'lobster' | 'conch'
  grade              public.lobster_grade,       -- lobster size; null for conch
  conch_clean_pct    integer,                    -- 80/90/95; null for lobster
  net_weight_lbs     numeric not null,
  sulfite            boolean not null default false,  -- lobster metabisulfite toggle
  packed_by          date,                       -- = date_pulled
  best_used_by       date,                       -- packed_by + shelf_life_months
  cites_cert_no      text,
  inspection_cert_no text,
  barcode            text,                       -- = case_code; Tera HID scan
  freezer_location   text,
  status             text not null default 'boxed',  -- boxed|in_holding|shipped|recalled
  shipment_id        uuid references public.spinytails_shipments(id),
  created_by         uuid,
  created_at         timestamptz not null default now(),
  constraint spinytails_cases_conch_clean_chk
    check (conch_clean_pct is null or conch_clean_pct in (80,90,95))
);
create index if not exists spinytails_cases_lot_idx    on public.spinytails_cases(lot_id);
create index if not exists spinytails_cases_status_idx on public.spinytails_cases(status);

-- 6) INVENTORY — barcode scan IN/OUT audit ledger (cases are source of truth)
create table if not exists public.spinytails_inventory (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid references public.spinytails_cases(id) on delete set null,
  lot_id          uuid references public.spinytails_lots(id),
  direction       text not null,                -- 'in' | 'out'
  freezer         text,                          -- 'blast' | 'holding'
  destination     text,                          -- on OUT: where it went
  scanned_barcode text,
  product_type    text,
  grade           public.lobster_grade,
  qty_cases       integer not null default 1,
  employee_id     uuid,
  device_id       text,
  created_at      timestamptz not null default now(),
  constraint spinytails_inventory_dir_chk check (direction in ('in','out'))
);
create index if not exists spinytails_inventory_case_idx on public.spinytails_inventory(case_id);

-- on-hand rollup: cases currently in holding, by freezer / product / size (FIFO via best_used_by)
create or replace view public.spinytails_inventory_on_hand as
  select product_type, grade, freezer_location,
         count(*)              as cases_on_hand,
         sum(net_weight_lbs)   as lbs_on_hand,
         min(best_used_by)     as earliest_best_used_by
  from public.spinytails_cases
  where status = 'in_holding'
  group by product_type, grade, freezer_location;

-- 7) SANITATION CHECKLIST — SSOP (start + end of day, P/F items as jsonb)
create table if not exists public.spinytails_sanitation_checklist (
  id                         uuid primary key default gen_random_uuid(),
  checklist_date             date not null,
  lot_code                   text,             -- optional packet link
  start_time                 time,
  end_time                   time,
  -- item_code -> { "start": "P"|"F", "end": "P"|"F", "comment": text }
  grades                     jsonb not null default '{}'::jsonb,
  chlorine_ppm_start         numeric,
  chlorine_ppm_end           numeric,
  sanitizer_nonfcs_type      text,
  sanitizer_nonfcs_ppm_start numeric,
  sanitizer_nonfcs_ppm_end   numeric,
  sanitizer_fcs_type         text,
  sanitizer_fcs_ppm_start    numeric,
  sanitizer_fcs_ppm_end      numeric,
  footbath_type              text default 'Bleach',
  footbath_ppm_start         numeric,
  footbath_ppm_end           numeric,
  verified_by_name           text,
  verified_by_role           text,
  signed_at                  timestamptz,
  created_by                 uuid,
  created_at                 timestamptz not null default now()
);
create index if not exists spinytails_sanitation_date_idx on public.spinytails_sanitation_checklist(checklist_date);

-- 8) FISHERIES EXPORT PACKETS — auto-assembled per batch (lot_code)
create table if not exists public.spinytails_fisheries_packets (
  id              uuid primary key default gen_random_uuid(),
  lot_code        text not null,
  batch_number    text,
  status          text not null default 'draft',  -- draft|generated|submitted
  pdf_url         text,
  record_snapshot jsonb,                            -- assembled source data
  verifier_name   text,
  verifier_role   text,
  generated_by    uuid,
  generated_at    timestamptz,
  submitted_to    text default 'Bahamas Fisheries',
  submitted_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists spinytails_packets_lot_idx on public.spinytails_fisheries_packets(lot_code);

-- 9) CONCH QUOTA — MAMR/PP-45 facility ceiling (130,000 lb finished, exp 2026-12-31)
create table if not exists public.spinytails_quota_config (
  species_code text primary key,
  ceiling_lbs  numeric not null,
  expires_on   date not null,
  label        text
);
insert into public.spinytails_quota_config(species_code, ceiling_lbs, expires_on, label)
  values ('CONCH', 130000, '2026-12-31', 'MAMR/PP-45 conch finished-weight ceiling')
  on conflict (species_code) do nothing;

create or replace view public.spinytails_conch_quota_status as
  select q.species_code, q.ceiling_lbs, q.expires_on,
         coalesce(sum(c.net_weight_lbs), 0)                    as finished_lbs_used,
         q.ceiling_lbs - coalesce(sum(c.net_weight_lbs), 0)    as lbs_remaining
  from public.spinytails_quota_config q
  left join public.spinytails_cases c
    on lower(c.product_type) = 'conch'
   and c.status <> 'recalled'
   and c.created_at::date <= q.expires_on
  where q.species_code = 'CONCH'
  group by q.species_code, q.ceiling_lbs, q.expires_on;

-- 10) RLS — mirror existing spinytails policy (qc_staff write, admin delete)
alter table public.spinytails_receiving_qc         enable row level security;
alter table public.spinytails_cases                enable row level security;
alter table public.spinytails_inventory            enable row level security;
alter table public.spinytails_sanitation_checklist enable row level security;
alter table public.spinytails_fisheries_packets    enable row level security;
alter table public.spinytails_quota_config         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'spinytails_receiving_qc','spinytails_cases','spinytails_inventory',
    'spinytails_sanitation_checklist','spinytails_fisheries_packets','spinytails_quota_config'
  ] loop
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format('drop policy if exists %I_ins on public.%I', t, t);
    execute format('drop policy if exists %I_upd on public.%I', t, t);
    execute format('drop policy if exists %I_del on public.%I', t, t);
    execute format('create policy %I_sel on public.%I for select using (is_bsc_qc_staff() or is_bsc_admin())', t, t);
    execute format('create policy %I_ins on public.%I for insert with check (is_bsc_qc_staff() or is_bsc_admin())', t, t);
    execute format('create policy %I_upd on public.%I for update using (is_bsc_qc_staff() or is_bsc_admin()) with check (is_bsc_qc_staff() or is_bsc_admin())', t, t);
    execute format('create policy %I_del on public.%I for delete using (is_bsc_admin())', t, t);
  end loop;
end $$;

-- 11) PRE-POPULATE the boats (vessel_code = VV in STPC lot code).
--     PARTNER = Sea-Ya-Later + Anointed Hands (portal); DIRECT = 4 Oscar Pinder
--     boats (no portal, captain null, owner in notes). cert_needs_review=true
--     for expired/renewal-due certs. NOTE: fisherman_name is NOT NULL, so the
--     Oscar boats carry 'Oscar Pinder' (owner) there with captain_name null.
insert into public.spinytails_vessels
  (vessel_code, vessel_name, fisherman_name, captain_name, license_number,
   color_tag, registration_expires_on, status, approved_at, access_type, cert_needs_review, notes)
values
  -- PARTNER (supplier-portal access)
  ('SY','Sea-Ya-Later','Trevor Whitfield','Trevor Whitfield','013821',
   'black','2027-03-31','approved', now(), 'partner', false, null),
  ('AH','Anointed Hands','Ricardo Farrington','Ricardo Farrington','010791',
   'white','2026-03-31','approved', now(), 'partner', true, 'Also registered FDC-1067 · renewal due'),
  -- DIRECT (no portal) — owner Oscar Pinder
  ('LP','Lady Princess','Oscar Pinder', null,'AB-983-SP',
   'red','2026-03-31','approved', now(), 'direct', false, 'Owner: Oscar Pinder'),
  ('LG','Lady Paige','Oscar Pinder', null,'AB-031398-SP',
   'purple','2026-03-31','approved', now(), 'direct', false, 'Owner: Oscar Pinder'),
  ('SS','Short Staff','Oscar Pinder', null,'AB-031399-SP',
   'yellow','2026-03-31','approved', now(), 'direct', false, 'Owner: Oscar Pinder'),
  ('AD','Adrian','Oscar Pinder', null,'AB-993-SP',
   'blue','2025-03-31','approved', now(), 'direct', true, 'Owner: Oscar Pinder · cert EXPIRED 2025-03-31')
on conflict (vessel_code) do update set
  vessel_name             = excluded.vessel_name,
  fisherman_name          = excluded.fisherman_name,
  captain_name            = excluded.captain_name,
  license_number          = excluded.license_number,
  registration_expires_on = excluded.registration_expires_on,
  access_type             = excluded.access_type,
  cert_needs_review       = excluded.cert_needs_review,
  notes                   = excluded.notes;

commit;

-- Verify (run after commit):
--   select vessel_code, vessel_name, captain_name, license_number, color_tag,
--          access_type, cert_needs_review, registration_expires_on, status
--     from public.spinytails_vessels order by access_type, vessel_code;
--   select table_name from information_schema.tables where table_schema='public'
--     and table_name in ('spinytails_cases','spinytails_inventory','spinytails_receiving_qc',
--       'spinytails_sanitation_checklist','spinytails_fisheries_packets','spinytails_quota_config')
--     order by table_name;
--   select * from public.spinytails_conch_quota_status;
