// app/api/notifications/send/route.ts
//
// Process queued notifications. Real-sends when provider creds are set
// in env; otherwise falls back to marking rows 'stub_sent' so we can
// verify the flow end-to-end and see what would-have-been-sent on
// /notifications.
//
// Providers:
//   - SMS + WhatsApp → Twilio (inline implementations below)
//   - Email          → Resend via lib/email.ts (single source of truth;
//                       same provider POS receipts use, so credentials
//                       are configured once)
//
// Triggers:
//   - POST → /notifications admin "Process queue" button (cashier UI)
//   - GET  → Vercel cron every 10 min (CRON_SECRET in Authorization)
//
// Server only — service-role for the notifications table.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_SMS = process.env.TWILIO_SMS_FROM;
const TWILIO_FROM_WA = process.env.TWILIO_WHATSAPP_FROM;

type Notification = {
  id: string;
  channel: 'sms' | 'whatsapp' | 'email';
  recipient_phone: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  subject: string | null;
  body: string;
  attempts: number;
};

// Shared worker — drains up to 50 queued notifications and updates each
// row with the send result. Called by both POST (admin button) and GET
// (Vercel cron). Returns a NextResponse so callers can pass it through.
async function processQueue(): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull up to 50 queued notifications ready to fire.
  const nowIso = new Date().toISOString();
  const { data: queued, error: qErr } = await admin
    .from('notifications')
    .select('id, channel, recipient_phone, recipient_email, recipient_name, subject, body, attempts')
    .eq('status', 'queued')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(50);

  if (qErr) {
    return NextResponse.json({ error: `Read queue failed: ${qErr.message}` }, { status: 500 });
  }
  if (!queued || queued.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const results: { id: string; status: string; error?: string }[] = [];

  for (const n of queued as Notification[]) {
    const result = await trySend(n);
    const update: Record<string, unknown> = {
      status: result.status,
      attempts: n.attempts + 1,
      updated_at: new Date().toISOString(),
    };
    if (result.status === 'sent' || result.status === 'stub_sent') {
      update.sent_at = new Date().toISOString();
    }
    if (result.error) update.error = result.error;
    if (result.providerId) update.provider_message_id = result.providerId;

    await admin.from('notifications').update(update).eq('id', n.id);
    results.push({ id: n.id, status: result.status, error: result.error });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

// POST → admin "Process queue" button on /notifications. Open today
// (admin page hits it with a session token but the route doesn't check).
// Follow-up hardening: add session-role check. For now matches existing
// behavior; the cron path below is the secured trigger.
export async function POST() {
  return processQueue();
}

// GET → Vercel cron. Every 10 minutes per vercel.json. CRON_SECRET in
// Authorization header is required (mirrors the pattern used by
// /api/ar/aging-alert, /api/cron/daily-briefing, /api/health-check).
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return processQueue();
}

type SendResult = { status: 'sent' | 'stub_sent' | 'failed'; error?: string; providerId?: string };

async function trySend(n: Notification): Promise<SendResult> {
  try {
    if (n.channel === 'sms') {
      if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM_SMS) {
        return { status: 'stub_sent' };
      }
      return await sendTwilioSms(n);
    }
    if (n.channel === 'whatsapp') {
      if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM_WA) {
        return { status: 'stub_sent' };
      }
      return await sendTwilioWhatsApp(n);
    }
    if (n.channel === 'email') {
      if (!process.env.RESEND_API_KEY) {
        return { status: 'stub_sent' };
      }
      return await sendResendEmail(n);
    }
    return { status: 'failed', error: `Unknown channel: ${n.channel}` };
  } catch (e) {
    return {
      status: 'failed',
      error: e instanceof Error ? e.message : 'unknown error',
    };
  }
}

// ─── Provider implementations (active when env vars set) ───

async function sendTwilioSms(n: Notification): Promise<SendResult> {
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams({
    From: TWILIO_FROM_SMS!,
    To: n.recipient_phone!,
    Body: n.body,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    }
  );
  const json = await res.json();
  if (!res.ok) return { status: 'failed', error: json?.message || `HTTP ${res.status}` };
  return { status: 'sent', providerId: json.sid };
}

async function sendTwilioWhatsApp(n: Notification): Promise<SendResult> {
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams({
    From: `whatsapp:${TWILIO_FROM_WA!}`,
    To: `whatsapp:${n.recipient_phone!}`,
    Body: n.body,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    }
  );
  const json = await res.json();
  if (!res.ok) return { status: 'failed', error: json?.message || `HTTP ${res.status}` };
  return { status: 'sent', providerId: json.sid };
}

// Resend via lib/email.ts — same provider POS receipts use, so the
// RESEND_API_KEY + RESEND_FROM_ADDRESS env vars are configured once.
async function sendResendEmail(n: Notification): Promise<SendResult> {
  if (!n.recipient_email) {
    return { status: 'failed', error: 'recipient_email missing' };
  }
  // Wrap the plain-text queue body in minimal HTML so Resend renders
  // cleanly. Newlines preserved, content escaped to prevent injection.
  const html = `<div style="font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; padding: 16px; color: #1c1c1c;">${escapeHtml(n.body).replace(/\n/g, '<br>')}</div>`;
  const r = await sendEmail({
    to:      n.recipient_email,
    subject: n.subject || 'BSC Marketplace',
    html,
  });
  if (r.error) return { status: 'failed', error: r.error };
  return { status: 'sent', providerId: r.id };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
