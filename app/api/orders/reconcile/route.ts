// POST /api/orders/reconcile
//
// Records the bank's transfer/settlement ID against an order's payment and
// marks it reconciled (who + when), so staff can track each payment against
// the bank "exchange". Reuses existing orders columns — NO schema change:
//   payment_approval        = the bank transfer ID (matches our payment ID)
//   payment_received_at/by  = reconciliation audit (timestamp + staff uuid)
//   payment_received_method = 'bank_transfer'
//   payment_received_notes  = optional note
//
// Staff-only + service-role (orders RLS is owner/staff-locked, and money
// confirmation must never be client-writable). Pass { unreconcile: true } to
// clear a mistaken match.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECON_ROLES = new Set(['founder', 'co_founder', 'manager', 'control_admin', 'basic_admin']);

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
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !RECON_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot reconcile payments.` }, { status: 403 });
  }

  let body: { order_id?: unknown; bank_transfer_id?: unknown; notes?: unknown; unreconcile?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const orderId = typeof body.order_id === 'string' ? body.order_id : '';
  if (!orderId) return NextResponse.json({ ok: false, error: 'order_id is required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Clear a mistaken match.
  if (body.unreconcile === true) {
    const { error } = await admin.from('orders').update({
      payment_approval:        null,
      payment_received_at:     null,
      payment_received_by:     null,
      payment_received_method: null,
    }).eq('id', orderId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reconciled: false });
  }

  const bankTransferId = typeof body.bank_transfer_id === 'string' ? body.bank_transfer_id.trim() : '';
  if (!bankTransferId) {
    return NextResponse.json({ ok: false, error: 'bank_transfer_id is required' }, { status: 400 });
  }
  const notes  = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  const nowIso = new Date().toISOString();

  // payment_received_method = 'wire' — the orders CHECK constraint allows
  // cash / card / wire / check / offset. Bank transfers from RBC settlement
  // are wires, so 'wire' tags the method correctly for the audit trail.
  const update: Record<string, unknown> = {
    payment_approval:        bankTransferId,
    payment_received_at:     nowIso,
    payment_received_by:     user.id,
    payment_received_method: 'wire',
  };
  if (notes) update.payment_received_notes = notes;

  const { error } = await admin.from('orders').update(update).eq('id', orderId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, reconciled: true, reconciled_at: nowIso, bank_transfer_id: bankTransferId });
}
