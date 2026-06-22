// /api/fulfillment/confirm-po
//
// A driver confirms (on pickup) that the supplier's product name + SKU + cost
// match the pick ticket / supplier invoice (which is our purchase order). Per
// the founder's chosen flow, that confirm AUTO-MARKS the PO paid and releases
// the order toward delivery — the founder reconciles the actual bank transfers
// after. (Driver tap commits the paid state by design.)
//
// On confirm:
//   • purchase_orders: supplier_confirmed_at/by stamped, payment_status='paid',
//     payment_date=now, status='ready'.
//   • when EVERY PO on the order is confirmed, the order's fulfillment_status
//     advances to 'collected' (driver now holds all the goods).
//
// Driver/staff only. Idempotent (a second confirm is a no-op).
//
// Body: { po_id }   Resp: { ok, po_id, order_released }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'driver', 'founder', 'co_founder', 'manager', 'control_admin', 'basic_admin', 'operations',
]);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot confirm pickups.` }, { status: 403 });
  }

  let b: { po_id?: unknown };
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const poId = typeof b.po_id === 'string' ? b.po_id : '';
  if (!poId) return NextResponse.json({ ok: false, error: 'po_id is required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();

  const { data: po } = await admin
    .from('purchase_orders')
    .select('id, order_id, supplier_confirmed_at')
    .eq('id', poId)
    .maybeSingle<{ id: string; order_id: string | null; supplier_confirmed_at: string | null }>();
  if (!po) return NextResponse.json({ ok: false, error: 'Purchase order not found' }, { status: 404 });

  // Idempotent — already confirmed.
  if (po.supplier_confirmed_at) {
    return NextResponse.json({ ok: true, po_id: poId, order_released: false, already: true });
  }

  const { error: updErr } = await admin.from('purchase_orders').update({
    supplier_confirmed_at: nowIso,
    supplier_confirmed_by: user.id,
    payment_status:        'paid',
    payment_date:          nowIso,
    status:                'ready',
  }).eq('id', poId);
  if (updErr) {
    return NextResponse.json({ ok: false, error: `Confirm failed: ${updErr.message}` }, { status: 500 });
  }

  // If every PO on the order is now confirmed, release the order to delivery.
  let orderReleased = false;
  if (po.order_id) {
    const { data: siblings } = await admin
      .from('purchase_orders')
      .select('supplier_confirmed_at')
      .eq('order_id', po.order_id);
    const allConfirmed = (siblings ?? []).length > 0 &&
      (siblings ?? []).every((s) => (s as { supplier_confirmed_at: string | null }).supplier_confirmed_at != null);
    if (allConfirmed) {
      await admin.from('orders')
        .update({ fulfillment_status: 'collected', collected_at: nowIso })
        .eq('id', po.order_id)
        .in('fulfillment_status', ['placed', 'preparing']);
      orderReleased = true;
    }
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'fulfillment_confirm_po',
      caller_id: user.id,
      input:     { po_id: poId },
      result:    { order_id: po.order_id, order_released: orderReleased, role },
      status:    'success',
      error:     null,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({ ok: true, po_id: poId, order_released: orderReleased });
}
