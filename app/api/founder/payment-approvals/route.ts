// /api/founder/payment-approvals
//
// Manual payment gate. Lists orders held in payment_approval_status='pending'
// (the safe default — nothing auto-confirms until a webhook validates OR the
// founder approves here). One-click approve → manual_override + marks paid so
// the order unlocks for fulfillment; decline → held as declined. Audited.
//
//   GET  → pending-approval orders
//   POST → { order_id, action:'approve'|'decline', note? }
// Founder/co_founder only. Service-role (orders RLS-locked).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVERS = new Set(['founder', 'co_founder']);

function svc(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function caller(req: NextRequest, admin: SupabaseClient) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { user: null, role: null };
  const uc = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { user: null, role: null };
  const { data: prof } = await admin.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  return { user, role: (prof as { role?: string | null } | null)?.role ?? null, name: (prof as { full_name?: string | null } | null)?.full_name ?? null };
}

export async function GET(req: NextRequest) {
  const admin = svc();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const { user, role } = await caller(req, admin);
  if (!user || !role || !APPROVERS.has(role)) return NextResponse.json({ ok: false, error: 'Founder only' }, { status: 403 });

  const { data, error } = await admin.from('orders')
    .select('id, created_at, customer_name, customer_phone, total, payment_method, payment_status, payment_approval_status, payment_webhook_received_at, order_type')
    .eq('payment_approval_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []).map((o: Record<string, unknown>) => ({
    id: o.id, ref: String(o.id).slice(0, 8).toUpperCase(), created_at: o.created_at,
    customer: o.customer_name, phone: o.customer_phone, total: Number(o.total ?? 0),
    payment_method: o.payment_method, order_type: o.order_type,
    reason: o.payment_webhook_received_at ? 'webhook received, awaiting approval' : 'no payment confirmation yet',
  }));
  return NextResponse.json({ ok: true, orders: rows });
}

export async function POST(req: NextRequest) {
  const admin = svc();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const { user, role, name } = await caller(req, admin);
  if (!user || !role || !APPROVERS.has(role)) return NextResponse.json({ ok: false, error: 'Founder only' }, { status: 403 });

  let b: { order_id?: unknown; action?: unknown; note?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const orderId = typeof b.order_id === 'string' ? b.order_id : '';
  const approve = b.action === 'approve';
  const decline = b.action === 'decline';
  if (!orderId || (!approve && !decline)) return NextResponse.json({ ok: false, error: "order_id + action ('approve'|'decline') required" }, { status: 400 });

  // Atomic: only act on an order that is STILL pending (guards double-approve).
  const patch = approve
    ? { payment_approval_status: 'manual_override', payment_status: 'paid_in_full', payment_received_by: user.id, payment_received_at: new Date().toISOString() }
    : { payment_approval_status: 'declined' };
  const { data, error } = await admin.from('orders').update(patch)
    .eq('id', orderId).eq('payment_approval_status', 'pending').select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: true, already: true, note: 'Order was not pending (already decided).' });

  try { await admin.from('ai_writes').insert({ tool: approve ? 'payment_manual_approve' : 'payment_decline', caller_id: user.id, input: { order_id: orderId, by: name ?? role, note: typeof b.note === 'string' ? b.note : null }, result: patch, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true });
}
