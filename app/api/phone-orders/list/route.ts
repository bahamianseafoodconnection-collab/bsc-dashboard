// /api/phone-orders/list
//
// Service-role read of phone orders for the founder approval queue + the
// cashier / Spiny-Tail dashboards (orders RLS blocks direct staff reads).
// Returns pending + approved phone orders, newest first.
//
// Query: ?status=pending|approved|all (default 'all'), ?limit (default 200)
// Allowed: founder/co_founder/manager/admins/cashier/andros_staff/operations.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'founder', 'co_founder', 'control_admin', 'basic_admin', 'manager',
  'cashier', 'andros_staff', 'operations',
]);

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot view phone orders.` }, { status: 403 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status') ?? 'all';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 500);

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let q = admin.from('orders')
    .select('id, created_at, customer_name, customer_phone, payment_type, wholesale_items, subtotal, total, status, payment_ref, admin_notes')
    .eq('order_type', 'phone_order')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (statusParam === 'pending') q = q.eq('status', 'pending_approval');
  else if (statusParam === 'approved') q = q.eq('status', 'approved');
  else q = q.in('status', ['pending_approval', 'approved']);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, role, orders: data ?? [] });
}
