// Multi-channel notification helper.
//
// One function call → fans out to:
//   • Email   → Resend (RESEND_API_KEY)
//   • SMS     → Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
//                       TWILIO_FROM_NUMBER) — stubs silently if missing
//   • Push    → Web Push hook placeholder (no provider wired yet)
//   • Dashboard → increments dashboard_notifications(unread_count) +
//               inserts a row so the dashboard badge can render
//
// Honors a do-not-disturb window of 10 PM → 5 AM America/Nassau for
// non-urgent notifications (urgent=true bypasses).

import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type Channel = 'email' | 'sms' | 'push' | 'dashboard';

export interface MultiChannelArgs {
  channels:    Channel[];
  emails?:     string[];
  phones?:     string[];
  title:       string;
  body:        string;
  url?:        string;
  urgent?:     boolean;
  relatedId?:  string | null;       // e.g. vendor_listing id
  relatedType?: string | null;      // e.g. 'vendor_listing'
}

export interface MultiChannelResult {
  delivered: Record<Channel, number>;
  errors:    string[];
  skipped:   string[];
}

const NASSAU_TZ = 'America/Nassau';

/** Returns the current local hour (0–23) in Nassau. */
function nassauHour(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone:   NASSAU_TZ,
    hour:       '2-digit',
    hour12:     false,
  });
  return Number(fmt.format(new Date()));
}

function isQuietHours(): boolean {
  const h = nassauHour();
  return h >= 22 || h < 5;
}

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function sendEmails(emails: string[], title: string, body: string, url?: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)            return { ok: false, error: 'RESEND_API_KEY missing' };
  if (emails.length === 0) return { ok: true };
  const from = process.env.RESEND_FROM_ADDRESS || 'BSC Alerts <noreply@bscbahamas.com>';
  const html = `<!doctype html><html><body style="font-family:'DM Sans',Arial,sans-serif;background:#f7f8f8;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden">
      <div style="background:#060d1f;color:#f5c518;padding:14px 20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-size:11px">BSC · Alert</div>
      <div style="padding:18px 20px;color:#0F1111;font-size:15px;line-height:1.6">
        <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:20px;margin:0 0 10px">${title}</h1>
        <p style="margin:0 0 14px">${body}</p>
        ${url ? `<p><a href="${url}" style="display:inline-block;background:#f5c518;color:#060d1f;padding:10px 18px;border-radius:6px;font-weight:700;text-decoration:none">Open</a></p>` : ''}
      </div>
    </div></body></html>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to: emails, subject: title, html }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'email send failed' };
  }
}

async function sendSms(phones: string[], body: string): Promise<{ ok: boolean; error?: string }> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from)  return { ok: false, error: 'Twilio creds missing (stub)' };
  if (phones.length === 0)      return { ok: true };
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  for (const phone of phones) {
    try {
      const form = new URLSearchParams({ From: from, To: phone, Body: body });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method:  'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    form.toString(),
      });
      if (!res.ok) return { ok: false, error: `Twilio ${res.status} for ${phone}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'sms send failed' };
    }
  }
  return { ok: true };
}

async function logDashboard(args: MultiChannelArgs): Promise<{ ok: boolean; error?: string }> {
  const admin = supa();
  if (!admin) return { ok: false, error: 'Supabase service key missing' };
  // dashboard_notifications table may not exist — best-effort insert.
  try {
    await admin.from('dashboard_notifications').insert({
      title:        args.title,
      body:         args.body,
      url:          args.url ?? null,
      urgent:       args.urgent ?? false,
      related_id:   args.relatedId ?? null,
      related_type: args.relatedType ?? null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'dashboard log failed' };
  }
}

export async function notifyMultiChannel(args: MultiChannelArgs): Promise<MultiChannelResult> {
  const result: MultiChannelResult = {
    delivered: { email: 0, sms: 0, push: 0, dashboard: 0 },
    errors:    [],
    skipped:   [],
  };

  const quiet = isQuietHours();
  if (quiet && !args.urgent) {
    result.skipped.push('quiet-hours: non-urgent notification suppressed (10 PM–5 AM Nassau)');
    return result;
  }

  if (args.channels.includes('email')) {
    const emails = args.emails ?? [];
    const r = await sendEmails(emails, args.title, args.body, args.url);
    if (r.ok) result.delivered.email = emails.length;
    else      result.errors.push('email: ' + (r.error ?? 'unknown'));
  }

  if (args.channels.includes('sms')) {
    const phones = args.phones ?? [];
    const r = await sendSms(phones, args.title + ' — ' + args.body + (args.url ? ' ' + args.url : ''));
    if (r.ok) result.delivered.sms = phones.length;
    else      result.errors.push('sms: ' + (r.error ?? 'unknown'));
  }

  if (args.channels.includes('push')) {
    // TODO: wire web-push provider (VAPID + service-worker subscription)
    result.skipped.push('push: provider not yet configured');
  }

  if (args.channels.includes('dashboard')) {
    const r = await logDashboard(args);
    if (r.ok) result.delivered.dashboard = 1;
    else      result.errors.push('dashboard: ' + (r.error ?? 'unknown'));
  }

  return result;
}

/** Read VENDOR_NOTIFICATION_EMAILS / _PHONES into a single recipient list. */
export function vendorAdminRecipients(): { emails: string[]; phones: string[] } {
  const emails = (process.env.VENDOR_NOTIFICATION_EMAILS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const phones = (process.env.VENDOR_NOTIFICATION_PHONES ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return { emails, phones };
}
