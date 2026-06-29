-- =====================================================================
-- docs/whatsapp/01-migration.sql   (G8 — WhatsApp intake)
--
-- Inbound WhatsApp messages (via Twilio) land here; the cashier monitors
-- them, adds the customer, and pulls a WhatsApp order into phone-order entry.
-- The webhook writes with the service role (bypasses RLS); staff read via
-- bsc_is_internal_staff() (created in G1a). Idempotent.
-- =====================================================================

create table if not exists public.whatsapp_messages (
  id                 uuid primary key default gen_random_uuid(),
  twilio_sid         text unique,
  from_number        text,
  from_name          text,
  body               text,
  num_media          int default 0,
  media_urls         jsonb,
  verified           boolean not null default false,   -- Twilio signature validated
  received_at        timestamptz not null default now(),
  handled_at         timestamptz,
  handled_by         uuid,
  linked_customer_id uuid,
  created_at         timestamptz not null default now()
);

create index if not exists whatsapp_messages_inbox_idx
  on public.whatsapp_messages (handled_at, received_at desc);

alter table public.whatsapp_messages enable row level security;
drop policy if exists whatsapp_messages_staff_all on public.whatsapp_messages;
create policy whatsapp_messages_staff_all on public.whatsapp_messages
  for all using (public.bsc_is_internal_staff()) with check (public.bsc_is_internal_staff());
