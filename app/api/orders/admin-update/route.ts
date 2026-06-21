// /api/orders/admin-update
//
// Server-authoritative admin/ops edits to an order's fulfillment + bookkeeping
// fields (fulfillment state-machine batch). Replaces the browser→RLS-direct
// orders.update() calls on:
//   • /orders          advanceStatus / cancelOrder   → status
//   • /pickup-queue     advance                        → status
//   • /wholesale-orders markPurchased / updateNotes    → status, admin_notes, admin_purchased
//   • /dashboard/ar-aging  link orphans               → customer_id (BATCH on many ids)
//
// This is a FAITHFUL move — same legacy `status` vocabulary, same fields, zero
// workflow change. The write just becomes role-gated + audited. The customer
// status-change notification stays on the client (fired after a successful
// write) so behavior is identical. NOTE: this does NOT touch the (dormant)
// fulfillment_status state machine — wiring that up is a separate decision.
//
// Body: { order_id?: string, order_ids?: string[],
//         status?, admin_notes?, admin_purchased?, customer_id? }
// Resp: { ok, affected }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Any BSC staff/ops role may advance fulfillment + bookkeeping (not money).
const STAFF_ROLES = new Set([
  'founder', 'co_founder', 'manager', 'control_admin', 'basic_admin',
  'operations', 'driver', 'cashier', 'andros_staff',
]);

// The live legacy status vocabulary (/orders STATUS_FLOW + PICKUP_FLOW +
// wholesale 'processing' + terminal Cancelled). 'completed' = POS sales.
const ALLOWED_STATUSES = new Set([
  'Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Ready for Pickup',
  'Delivered', 'Cancelled', 'processing', 'completed',
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
  if (!role || !STAFF_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot edit orders.` }, { status: 403 });
  }

  let b: {
    order_id?: unknown; order_ids?: unknown;
    status?: unknown; admin_notes?: unknown; admin_purchased?: unknown; customer_id?: unknown;
  };
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const ids = Array.isArray(b.order_ids)
    ? (b.order_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    : (typeof b.order_id === 'string' && b.order_id ? [b.order_id] : []);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: 'order_id or order_ids required' }, { status: 400 });

  // Build the whitelisted update payload.
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    const status = typeof b.status === 'string' ? b.status : '';
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: `Unknown status "${status}"` }, { status: 400 });
    }
    payload.status = status;
  }
  if (typeof b.admin_notes === 'string') payload.admin_notes = b.admin_notes;
  if (b.admin_purchased === true) {
    payload.admin_purchased = true;
    payload.admin_purchased_at = new Date().toISOString();
  }
  if (typeof b.customer_id === 'string' && b.customer_id) payload.customer_id = b.customer_id;

  // Need at least one real field beyond updated_at.
  if (Object.keys(payload).length <= 1) {
    return NextResponse.json({ ok: false, error: 'No editable fields in request' }, { status: 400 });
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let affected = 0;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('orders').update(payload).in('id', ids).select('id');
    if (error) err = error.message; else affected = (data ?? []).length;
  } catch (e) {
    err = e instanceof Error ? e.message : 'update failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'orders_admin_update',
      caller_id: user.id,
      input:     { ids_count: ids.length, fields: Object.keys(payload).filter((k) => k !== 'updated_at') },
      result:    { affected, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Order update failed: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, affected });
}
