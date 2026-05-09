// app/api/contact/route.ts
//
// Public contact form sink. Writes the inbound message into the
// notifications queue addressed to BSC's mailbox so it shows up on
// /notifications alongside outbound messages — single inbox.
//
// Until SendGrid is wired the row lands as 'stub_sent', preserving the
// audit trail. When email creds ship, the queue processor will forward
// the body to BSC_INBOX_EMAIL automatically.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BSC_INBOX_EMAIL = 'Bahamiansc@iCloud.com';

type Body = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  topic?: string;
  message?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const name = (body.name || '').trim();
  const message = (body.message || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const topic = (body.topic || 'General').trim();

  if (!name || !message || (!email && !phone))
    return NextResponse.json({ ok: false, error: 'Name, message, and email or phone are required' }, { status: 400 });
  if (message.length > 5000)
    return NextResponse.json({ ok: false, error: 'Message too long' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const composed = [
    `From: ${name}`,
    email ? `Email: ${email}` : '',
    phone ? `Phone: ${phone}` : '',
    `Topic: ${topic}`,
    '',
    message,
  ].filter(Boolean).join('\n');

  const { error: insErr } = await admin.from('notifications').insert({
    channel: 'email',
    recipient_email: BSC_INBOX_EMAIL,
    recipient_name: 'BSC',
    template_key: 'contact_form',
    subject: `Contact: ${topic} — ${name}`,
    body: composed,
    status: 'queued',
  });

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
