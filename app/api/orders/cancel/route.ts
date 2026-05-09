// app/api/orders/cancel/route.ts
//
// Customer-initiated order cancellation. Server-side so we don't need
// permissive customer-update RLS — the caller's auth token is verified
// against orders.user_id before any update happens.
//
// Allowed only when:
//   - the caller owns the order (auth.uid() == orders.user_id)
//   - the order is in a cancellable status (Pending / Confirmed / pending /
//     processing / payment_pending)
//   - the order was placed within CANCEL_WINDOW_MINUTES (default 30)
//
// On success: status flips to 'Cancelled', a status-change notification is
// enqueued (best-effort), and the new state is returned to the client.
//
// POST { order_id: string }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANCEL_WINDOW_MINUTES = 30;

const CANCELLABLE_STATUSES = new Set([
  'Pending', 'Confirmed', 'pending', 'processing', 'payment_pending',
]);

type Body = { order_id?: string };

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  if (!body.order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  // Verify caller identity from the bearer token.
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });

  // Service-role client for the actual mutation.
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: order, error: getErr } = await admin
    .from('orders')
    .select('id, user_id, status, payment_status, created_at, customer_name, customer_phone, customer_id')
    .eq('id', body.order_id)
    .maybeSingle();
  if (getErr || !order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });

  if (order.user_id !== user.id)
    return NextResponse.json({ ok: false, error: 'Not your order' }, { status: 403 });

  const ageMs = Date.now() - new Date(order.created_at).getTime();
  if (ageMs > CANCEL_WINDOW_MINUTES * 60 * 1000)
    return NextResponse.json({
      ok: false,
      error: `Cancellation window has passed (${CANCEL_WINDOW_MINUTES} minutes). Reach out on WhatsApp +1 (242) 361-3474.`,
    }, { status: 409 });

  const liveStatus = order.status || order.payment_status || '';
  if (!CANCELLABLE_STATUSES.has(liveStatus))
    return NextResponse.json({
      ok: false,
      error: `Order is already ${liveStatus} — can't cancel from here.`,
    }, { status: 409 });

  const { error: updErr } = await admin
    .from('orders')
    .update({ status: 'Cancelled' })
    .eq('id', order.id);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  // Enqueue a status-change notification (best-effort, non-blocking via
  // the existing /api/notifications/queue endpoint). Lives here on the
  // server because the client cancellation flow doesn't have direct
  // access to phone fields.
  try {
    const baseUrl = new URL(req.url);
    await fetch(`${baseUrl.origin}/api/notifications/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: order.customer_phone ? 'whatsapp' : 'email',
        recipient_phone: order.customer_phone || null,
        recipient_email: user.email || null,
        recipient_name: order.customer_name || null,
        template_key: 'order_status_cancelled',
        subject: 'Your BSC order was cancelled',
        body: `Hi ${order.customer_name || 'there'}, your BSC order #${order.id.slice(0, 8)} has been cancelled at your request. If this was a mistake, reach out on WhatsApp +1 (242) 361-3474.`,
        related_order_id: order.id,
        related_customer_id: order.customer_id || null,
      }),
    });
  } catch { /* ignore — cancellation already succeeded */ }

  return NextResponse.json({ ok: true, status: 'Cancelled' });
}
