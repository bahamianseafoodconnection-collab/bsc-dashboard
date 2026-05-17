// POST /api/email/order-status
//
// Body: { order_id: string; new_status: string; message?: string }
//
// Looks up the order + linked customer's email, then fires Resend's
// sendOrderStatusUpdate template. No-ops when no email is on file (e.g.
// walk-in POS customers who never provided one).
//
// Called by lib/notify-status-change.ts on every fulfillment status
// transition. Safe to call from any client — auth not required because:
//   - It only READS one order + one customer row.
//   - It sends to the customer who's actually attached to that order.
//   - There's no path to inject an attacker email; the recipient is
//     pulled from the DB by order_id.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendOrderStatusUpdate } from '@/lib/email-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { order_id?: string; new_status?: string; message?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const orderId   = (body.order_id   ?? '').toString();
  const newStatus = (body.new_status ?? '').toString();
  if (!orderId || !newStatus) {
    return NextResponse.json({ ok: false, error: 'order_id + new_status required' }, { status: 400 });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) {
    return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  }
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Pull order + denormalized customer fields first.
  const { data: order, error: oErr } = await admin
    .from('orders')
    .select('id, customer_id, customer_name, customer_email')
    .eq('id', orderId)
    .maybeSingle();
  if (oErr)   return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 });

  let toEmail = (order.customer_email ?? '').trim();
  let name    = (order.customer_name  ?? '').trim() || 'friend';
  let cid     = (order.customer_id    ?? null);

  // Fall back to the linked customer record (for orders where the inline
  // customer_email column was never populated — e.g. POS-created orders).
  if (!toEmail && cid) {
    const { data: cust } = await admin
      .from('customers')
      .select('email, full_name')
      .eq('id', cid)
      .maybeSingle();
    if (cust) {
      if (!toEmail && cust.email)       toEmail = cust.email;
      if (cust.full_name && name === 'friend') name = cust.full_name;
    }
  }

  if (!toEmail) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no email on file' });
  }

  const r = await sendOrderStatusUpdate({
    to:            toEmail,
    customer_id:   cid ?? undefined,
    customer_name: name,
    order_id:      orderId,
    new_status:    newStatus,
    message:       body.message,
  });
  if (r.error) {
    console.error('Order status email failed:', r.error);
    return NextResponse.json({ ok: false, sent: false, error: r.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent: true, id: r.id });
}
