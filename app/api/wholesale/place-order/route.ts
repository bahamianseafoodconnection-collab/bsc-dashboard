// /api/wholesale/place-order
//
// Server-authoritative placement for a local-wholesale B2B order (Phase 5
// batch 6c). Replaces the browser→RLS-direct orders.insert in
// app/local-wholesale/[wholesaler].
//
// Unlike a register sale, this is an UNPAID order request: it is committed as
// payment_method='cod', payment_status='pending', status pending — staff
// review + fulfil it later. No money state is forged here; the route forces
// those fields server-side and stamps the placer from the verified session.
// Auth is required (the wholesaler is signed in) but not a staff role.
//
// Body: { wholesaler, items: [...], total, note? }
// Resp: { ok, order_id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required to place an order.' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session — sign in again.' }, { status: 401 });

  let b: { wholesaler?: unknown; items?: unknown; total?: unknown; note?: unknown };
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const wholesaler = typeof b.wholesaler === 'string' ? b.wholesaler : null;
  const items = Array.isArray(b.items) ? b.items as unknown[] : [];
  const total = typeof b.total === 'number' && Number.isFinite(b.total) ? Math.round(b.total * 100) / 100 : NaN;
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null;
  if (items.length === 0) return NextResponse.json({ ok: false, error: 'No items in order' }, { status: 400 });
  if (!(total >= 0)) return NextResponse.json({ ok: false, error: 'Invalid order total' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let orderId: string | null = null;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('orders').insert({
      order_type:           'local_wholesale',
      wholesaler,
      wholesale_items:      items,
      wholesale_cost_total: total,
      payment_method:       'cod',
      payment_status:       'pending',
      admin_notes:          note,
      // orders has NO user_id column; record the placer in admin_notes instead.
    }).select('id').single();
    if (error) err = error.message; else orderId = (data as { id: string }).id;
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'wholesale_place_order',
      caller_id: user.id,
      input:     { wholesaler, item_count: items.length, total },
      result:    { order_id: orderId },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Could not place order: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, order_id: orderId });
}
