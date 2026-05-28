// /api/orders/[id]/transition
//
// Single endpoint that advances an order through the fulfillment
// lifecycle. Every stage move (preparing / collected / in_transit /
// out_for_delivery / delivered / cancel) goes through here so the
// state machine in lib/order-status.ts is the only authority.
//
// Body: { action: TransitionAction, pod_photo_urls?: string[],
//         pod_signature_b64?: string }
//
// Enforces:
//   - role × transition rules (validateTransition)
//   - valid from-state (no skipping / no backwards)
//   - proof-of-delivery photo required for mark_delivered
//
// On success: stamps the right timestamp + person column, fires a
// customer notification at customer-facing transitions.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  validateTransition, transitionPayload, customerStage,
  type TransitionAction, type FulfillmentStatus,
} from '@/lib/order-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  action?:            unknown;
  pod_photo_urls?:    unknown;
  pod_signature_b64?: unknown;
}

interface OrderRow {
  id:                  string;
  fulfillment_status:  string | null;
  customer_name:       string | null;
  customer_phone:      string | null;
  customer_email:      string | null;
  pod_photo_urls:      string[] | null;
  customer_id:         string | null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await ctx.params;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;

  // Body
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const action = body.action as TransitionAction;
  if (!action) return NextResponse.json({ ok: false, error: 'action required' }, { status: 400 });

  const podPhotos = Array.isArray(body.pod_photo_urls)
    ? (body.pod_photo_urls as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const podSignature = typeof body.pod_signature_b64 === 'string' ? body.pod_signature_b64 : null;

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Load current order state
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, fulfillment_status, customer_name, customer_phone, customer_email, pod_photo_urls, customer_id')
    .eq('id', orderId)
    .maybeSingle<OrderRow>();
  if (orderErr || !order) {
    return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  }

  // For mark_delivered, PoD photos can come in this request OR already
  // be on the order. Either satisfies the requirement.
  const hasPod = podPhotos.length > 0 || (order.pod_photo_urls?.length ?? 0) > 0;

  // Validate the transition
  const validationError = validateTransition(action, order.fulfillment_status, role, hasPod);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 403 });
  }

  // Build the UPDATE payload
  const payload = transitionPayload(action, user.id);
  // Attach PoD evidence if this request carries it
  if (podPhotos.length > 0)  payload.pod_photo_urls   = podPhotos;
  if (podSignature)          payload.pod_signature_b64 = podSignature;

  const { error: updErr } = await admin.from('orders').update(payload).eq('id', orderId);
  if (updErr) {
    return NextResponse.json({ ok: false, error: `Update failed: ${updErr.message}` }, { status: 500 });
  }

  const newStatus = payload.fulfillment_status as FulfillmentStatus;
  const cust = customerStage(newStatus);

  // Fire a customer notification at customer-facing transitions (not
  // every internal step — collected + in_transit both show "In Transit"
  // so we don't double-notify). Fire-and-forget; failures don't block.
  try {
    if (order.customer_name && (order.customer_phone || order.customer_email)) {
      const channel = order.customer_phone ? 'whatsapp' : 'email';
      const shortId = order.id.slice(0, 8);
      await admin.from('notifications').insert({
        channel,
        recipient_phone: order.customer_phone,
        recipient_email: channel === 'email' ? order.customer_email : null,
        recipient_name:  order.customer_name,
        template_key:    `order_${cust.stage}`,
        subject:         `Order #${shortId} — ${cust.label}`,
        body:            `Hi ${order.customer_name}, ${cust.message} (Order #${shortId})`,
        related_order_id: order.id,
        related_customer_id: order.customer_id,
      });
    }
  } catch (notifyErr) {
    console.warn('Order transition notification failed (non-fatal):', notifyErr);
  }

  return NextResponse.json({
    ok:                 true,
    order_id:           order.id,
    fulfillment_status: newStatus,
    customer_stage:     cust.stage,
    customer_label:     cust.label,
  });
}
