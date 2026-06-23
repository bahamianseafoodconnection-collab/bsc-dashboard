// /api/driver/queue
//
// Service-role read of the active delivery queue for the /driver
// dashboard. Routed through the server (not the browser client) so the
// queue does NOT depend on `driver` being inside is_staff(), and so a
// driver can ONLY ever see the online-delivery queue — never POS sales,
// wholesale, or any other order channel. Scoped + role-gated.
//
// Returns online_market orders whose fulfillment_status is still active
// (placed → out_for_delivery), oldest first.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['founder', 'co_founder', 'manager', 'driver'];
const ACTIVE_STATES = ['placed', 'preparing', 'collected', 'in_transit', 'out_for_delivery'];

const QUEUE_COLUMNS =
  'id, fulfillment_status, customer_name, customer_phone, customer_address, ' +
  'delivery_directions, delivery_lat, delivery_lng, total, created_at, ' +
  'wholesale_items, pod_photo_urls, driver_assigned_to, ' +
  'payment_method, payment_status, payment_received_at';

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // Auth — verify the caller and their role
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
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Driver / manager / founder only' }, { status: 403 });
  }

  // Service-role read, scoped to the online delivery queue only
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin
    .from('orders')
    .select(QUEUE_COLUMNS)
    .eq('order_type', 'online_market')
    .in('fulfillment_status', ACTIVE_STATES)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, orders: data ?? [] });
}
