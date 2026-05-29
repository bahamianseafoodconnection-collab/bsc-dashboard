// GET /api/orders/mine
//
// Signed-in customer's order history. Two reasons this must be a service-role
// endpoint rather than a direct client query:
//   1. orders RLS is owner/staff-locked (the 2026-05-28 lockdown).
//   2. orders.customer_id is inconsistent — /market quick-buy stores the
//      buyer's auth uid, while /checkout stores the linked customers-record id.
// So we authenticate the bearer token, resolve BOTH id forms (auth uid +
// every customers.id linked to that auth user), and return orders matching
// either. Returns the limited history fields only — never cost/profit/supplier.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS =
  'id, created_at, order_type, status, payment_status, payment_method, ' +
  'total, wholesale_cost_total, delivery_type, customer_address, wholesale_items';

export async function GET(req: NextRequest) {
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

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Resolve both customer_id forms for this user.
  const ids = new Set<string>([user.id]);
  const { data: custs } = await admin.from('customers').select('id').eq('auth_user_id', user.id);
  for (const c of (custs ?? []) as { id: string }[]) ids.add(c.id);

  const { data, error } = await admin
    .from('orders')
    .select(FIELDS)
    .in('customer_id', [...ids])
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, orders: data ?? [] });
}
