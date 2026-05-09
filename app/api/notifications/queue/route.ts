// app/api/notifications/queue/route.ts
//
// Queue an outbound notification. Used internally by POS / checkout /
// stock alerts / etc. Inserts a row in public.notifications with
// status='queued'; the sender route processes the queue.
//
// Validates minimum recipient info per channel:
//   sms / whatsapp -> recipient_phone required
//   email          -> recipient_email required

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  channel?: 'sms' | 'whatsapp' | 'email';
  recipient_phone?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;
  template_key?: string | null;
  subject?: string | null;
  body?: string;
  scheduled_for?: string;
  related_order_id?: string | null;
  related_customer_id?: string | null;
  related_user_id?: string | null;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channel = body.channel;
  if (channel !== 'sms' && channel !== 'whatsapp' && channel !== 'email') {
    return NextResponse.json(
      { error: 'channel must be sms | whatsapp | email' },
      { status: 400 }
    );
  }
  if ((channel === 'sms' || channel === 'whatsapp') && !body.recipient_phone) {
    return NextResponse.json(
      { error: `${channel} requires recipient_phone` },
      { status: 400 }
    );
  }
  if (channel === 'email' && !body.recipient_email) {
    return NextResponse.json({ error: 'email requires recipient_email' }, { status: 400 });
  }
  if (!body.body || !body.body.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const payload: Record<string, unknown> = {
    channel,
    recipient_phone: body.recipient_phone || null,
    recipient_email: body.recipient_email || null,
    recipient_name: body.recipient_name || null,
    template_key: body.template_key || null,
    subject: body.subject || null,
    body: body.body.trim(),
    status: 'queued',
    scheduled_for: body.scheduled_for || new Date().toISOString(),
    related_order_id: body.related_order_id || null,
    related_customer_id: body.related_customer_id || null,
    related_user_id: body.related_user_id || null,
  };

  const { data, error } = await admin
    .from('notifications')
    .insert(payload)
    .select('id, status')
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Queue failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data?.id, status: data?.status });
}
