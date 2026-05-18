// Daily Briefing → Resend.
//
// Renders the React Email template (emails/DailyBriefing.tsx) into HTML
// server-side, then ships it to:
//   • Dedrick — bahamianseafoodconnection@gmail.com (hard-coded fallback)
//   • Jaquel  — fetched from profiles where role IN
//               ('co_founder','control_admin','manager','basic_admin')
//
// Persists every send attempt to public.daily_briefings.
//
// SERVER-ONLY: react-dom/server is loaded dynamically inside renderHtml()
// so Next.js's bundler doesn't try to drag it into client builds.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import DailyBriefing, { type DailyBriefingProps } from '@/emails/DailyBriefing';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const FOUNDER_EMAIL_FALLBACK = 'bahamianseafoodconnection@gmail.com';

const RECIPIENT_ROLES = ['founder', 'co_founder', 'control_admin', 'manager', 'basic_admin'];

export interface SendDailyBriefingArgs {
  briefingDate?:   string;                // "Saturday, May 17 2026"
  briefingDateIso?: string;               // "2026-05-17" for the DB row
  content:          DailyBriefingProps;   // the structured email content
  rawData?:         unknown;              // optional snapshot to archive
}

export interface SendDailyBriefingResult {
  sent_to:  string[];
  sent_at:  string | null;
  status:   'sent' | 'failed' | 'placeholder';
  error?:   string;
  briefing_id?: string;
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveRecipients(supa: SupabaseClient): Promise<string[]> {
  const set = new Set<string>([FOUNDER_EMAIL_FALLBACK.toLowerCase()]);

  const { data: rows } = await supa
    .from('profiles')
    .select('id, role')
    .in('role', RECIPIENT_ROLES);

  const ids = (rows ?? []).map((r) => r.id as string);
  for (const id of ids) {
    try {
      const { data } = await supa.auth.admin.getUserById(id);
      const email = data?.user?.email?.toLowerCase();
      if (email) set.add(email);
    } catch { /* skip missing */ }
  }
  return Array.from(set);
}

async function renderHtml(props: DailyBriefingProps): Promise<string> {
  // Dynamic import keeps react-dom/server out of any client bundle.
  const [{ default: React }, { renderToStaticMarkup }] = await Promise.all([
    import('react'),
    import('react-dom/server'),
  ]);
  const tree = React.createElement(DailyBriefing, props);
  const markup = renderToStaticMarkup(tree);
  return '<!doctype html>' + markup;
}

export async function sendDailyBriefing(args: SendDailyBriefingArgs): Promise<SendDailyBriefingResult> {
  const supa = adminClient();
  if (!supa) {
    return { sent_to: [], sent_at: null, status: 'failed', error: 'Supabase service key missing' };
  }

  const apiKey      = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS || 'BSC Daily Briefing <noreply@bscbahamas.com>';

  const recipients      = await resolveRecipients(supa);
  const briefingDate    = args.briefingDate    ?? new Date().toDateString();
  const briefingDateIso = args.briefingDateIso ?? new Date().toISOString().slice(0, 10);
  const html            = await renderHtml(args.content);
  const subject         = `BSC Daily Briefing — ${briefingDate}`;

  // Persist a row first so we always have an audit trail even if
  // Resend explodes.
  const { data: row, error: insertErr } = await supa
    .from('daily_briefings')
    .insert({
      briefing_date:     briefingDateIso,
      raw_data_json:     args.rawData ?? null,
      generated_content: html,
      sent_to:           recipients,
      status:            'pending',
    })
    .select('id')
    .single();

  const briefingId = row?.id as string | undefined;
  if (insertErr) {
    return { sent_to: recipients, sent_at: null, status: 'failed', error: 'DB insert: ' + insertErr.message };
  }

  if (!apiKey) {
    if (briefingId) {
      await supa.from('daily_briefings').update({ status: 'placeholder' }).eq('id', briefingId);
    }
    return { sent_to: recipients, sent_at: null, status: 'placeholder', error: 'RESEND_API_KEY missing', briefing_id: briefingId };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    fromAddress,
        to:      recipients,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      if (briefingId) {
        await supa.from('daily_briefings').update({ status: 'failed' }).eq('id', briefingId);
      }
      return { sent_to: recipients, sent_at: null, status: 'failed', error: `Resend ${res.status}: ${errBody}`, briefing_id: briefingId };
    }
    const sentAt = new Date().toISOString();
    if (briefingId) {
      await supa.from('daily_briefings').update({ status: 'sent', sent_at: sentAt }).eq('id', briefingId);
    }
    return { sent_to: recipients, sent_at: sentAt, status: 'sent', briefing_id: briefingId };
  } catch (e) {
    if (briefingId) {
      await supa.from('daily_briefings').update({ status: 'failed' }).eq('id', briefingId);
    }
    return { sent_to: recipients, sent_at: null, status: 'failed', error: e instanceof Error ? e.message : 'unknown error', briefing_id: briefingId };
  }
}
