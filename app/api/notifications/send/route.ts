// app/api/notifications/send/route.ts
//
// Process queued notifications. Until provider creds are wired, this runs
// in STUB mode — it marks rows as 'stub_sent' so we can verify the flow
// end-to-end and see what would-have-been-sent on /notifications.
//
// When you add credentials, swap the stub sender for actual provider
// calls (Twilio for SMS/WhatsApp, SendGrid/Resend/Postmark for email).
// The sender contract (success/failure/error) stays the same.
//
// Trigger: call from cron or manually from /notifications "Process queue"
// button. Server only — service role.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_SMS = process.env.TWILIO_SMS_FROM;
const TWILIO_FROM_WA = process.env.TWILIO_WHATSAPP_FROM;
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL;

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

export async function POST() {
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
      if (!SENDGRID_KEY || !SENDGRID_FROM) {
        return { status: 'stub_sent' };
      }
      return await sendSendgridEmail(n);
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

async function sendSendgridEmail(n: Notification): Promise<SendResult> {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: n.recipient_email!, name: n.recipient_name || undefined }],
          subject: n.subject || 'BSC Marketplace',
        },
      ],
      from: { email: SENDGRID_FROM!, name: 'BSC Marketplace' },
      content: [{ type: 'text/plain', value: n.body }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { status: 'failed', error: `SendGrid ${res.status}: ${text.slice(0, 200)}` };
  }
  const id = res.headers.get('x-message-id') || undefined;
  return { status: 'sent', providerId: id };
}
