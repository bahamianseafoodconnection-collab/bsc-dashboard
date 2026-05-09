-- BSC Dashboard — notifications queue
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Every outbound message BSC wants to send is queued here first. When
-- Twilio/WhatsApp/SendGrid creds land, the sender flips from
-- 'stub_sent' to actual provider calls in /api/notifications/send.

drop table if exists public.notifications cascade;

create table public.notifications (
  id                  uuid          primary key default gen_random_uuid(),
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),

  -- Routing
  channel             text          not null
                      check (channel in ('sms','whatsapp','email')),
  recipient_phone     text,
  recipient_email     text,
  recipient_name      text,

  -- Content
  template_key        text,                                  -- 'order_confirmation', 'low_stock', etc.
  subject             text,                                  -- email only
  body                text          not null,

  -- Status: queued -> stub_sent (no creds yet) | sent | failed | skipped
  status              text          not null default 'queued'
                      check (status in ('queued','stub_sent','sent','failed','skipped')),
  attempts            integer       not null default 0 check (attempts >= 0),
  error               text,
  scheduled_for       timestamptz   not null default now(),
  sent_at             timestamptz,
  provider_message_id text,                                  -- Twilio SID, SendGrid msg ID, etc.

  -- Audit links (all nullable)
  related_order_id    uuid,
  related_customer_id uuid,
  related_user_id     uuid,

  recorded_by         uuid
);

create index notifications_status_idx
  on public.notifications (status, scheduled_for) where status in ('queued','failed');
create index notifications_created_idx
  on public.notifications (created_at desc);
create index notifications_template_idx
  on public.notifications (template_key, created_at desc);

-- ─── RLS ───
alter table public.notifications enable row level security;

drop policy if exists "notif_insert_any"   on public.notifications;
drop policy if exists "notif_update_staff" on public.notifications;
drop policy if exists "notif_select_staff" on public.notifications;

-- Insert open: POS / checkout / signup queue notifications from anon-key
-- clients. The sender then runs server-side with service role to update
-- status/sent_at — that's gated by the staff RLS for visibility but the
-- sender bypasses RLS via service role anyway.
create policy "notif_insert_any"
  on public.notifications for insert
  with check (true);

create policy "notif_update_staff"
  on public.notifications for update
  using      (auth.uid() in (select id from public.users where is_active = true))
  with check (auth.uid() in (select id from public.users where is_active = true));

create policy "notif_select_staff"
  on public.notifications for select
  using (auth.uid() in (select id from public.users where is_active = true));
