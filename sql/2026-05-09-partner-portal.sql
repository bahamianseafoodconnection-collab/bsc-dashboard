-- BSC Dashboard - Partner Access Tokens (multi-tenant Partner Portal)
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Generates per-partner shareable URL tokens for /partner/[token].
-- Each partner (mapped to public.suppliers) can have multiple active
-- tokens (e.g., one for Bob personally, one for his accountant).
-- Tokens are opaque 32-hex strings, scoped read-only to that partner's
-- data: outstanding balance, payment history, future inventory + shipments.
--
-- Auth model: the TOKEN is the auth. No login required. Partner pastes
-- the URL on phone, sees their dashboard. Frictionless WhatsApp-shareable.

create table if not exists public.partner_access_tokens (
  id              uuid          primary key default gen_random_uuid(),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  token           text          not null,
  supplier_id     uuid          not null
                  references public.suppliers(id) on delete cascade,
  label           text,                            -- "Bob's main link" / "Bob's accountant"

  -- Lifecycle
  expires_at      timestamptz,                     -- nullable = never expires
  revoked_at      timestamptz,                     -- nullable = active
  last_accessed_at timestamptz,
  access_count    integer       not null default 0
);

create unique index if not exists partner_tokens_token_uniq
  on public.partner_access_tokens (token);

create index if not exists partner_tokens_supplier_idx
  on public.partner_access_tokens (supplier_id, created_at desc);

create index if not exists partner_tokens_active_idx
  on public.partner_access_tokens (revoked_at, expires_at)
  where revoked_at is null;

alter table public.partner_access_tokens enable row level security;

-- No public RLS read - the API route uses service role to look up tokens
-- and return scoped data. Direct table access stays admin-only.
drop policy if exists "partner_tokens_admin_only" on public.partner_access_tokens;
-- Intentionally no select policy - service-role bypasses RLS for the API.
