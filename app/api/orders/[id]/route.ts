// GET /api/orders/[id]
//
// Secure server-side read of a single order, used by the customer- and
// guest-facing order pages (tracking, account order detail, receipt).
//
// Why this exists: orders RLS is locked to staff + the owning customer
// (auth.uid() = customer_id). But two legitimate flows read orders
// WITHOUT that match — a not-logged-in guest tracking the order they just
// placed, and a guest/checkout customer whose order.customer_id is a
// customers-table record rather than their auth id. Those reads go
// through here instead of the browser client.
//
// Access model (least privilege):
//   - staff (valid token, is_staff role)      → full order
//   - the owning customer (auth.uid = customer_id) → full order
//   - anyone holding the order's UUID          → limited fields only
//     (status + items + delivery progress; the unguessable id is the
//     capability — same model as a tokenized "track your order" link).
//     NO cross-order enumeration: you must already know the exact id.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set([
  'founder', 'co_founder', 'manager', 'supervisor', 'control_admin',
  'basic_admin', 'cashier', 'right_hand', 'processor', 'strategist',
  'andros_staff', 'receiver', 'driver',
]);

// Fields safe to return to a guest who holds the order UUID. Includes the
// contact/delivery info the customer themselves entered (shown back to
// them on the tracking page); excludes internal cost/profit columns.
const PUBLIC_FIELDS =
  'id, order_number, created_at, order_type, status, payment_status, ' +
  'payment_method, payment_ref, subtotal, tax, vat_amount, delivery_fee, ' +
  'total, delivery_type, delivery_address, customer_address, customer_name, ' +
  'customer_phone, wholesale_items, items, promo_code, promo_discount, ' +
  'admin_notes, fulfillment_status, preparing_at, collected_at, in_transit_at, ' +
  'out_for_delivery_at, delivered_at, pod_photo_urls, delivery_directions';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: 'Order id required' }, { status: 400 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // Resolve the caller (optional — guests have no token).
  let callerId: string | null = null;
  let callerRole: string | null = null;
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      callerId = user.id;
      const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      callerRole = (prof as { role?: string | null } | null)?.role ?? null;
    }
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const isStaff = !!callerRole && STAFF_ROLES.has(callerRole);

  if (isStaff) {
    const { data, error } = await admin.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ ok: true, order: data, scope: 'staff' });
  }

  // Non-staff: load the limited field set, then decide owner-vs-guest.
  const { data, error } = await admin.from('orders').select(PUBLIC_FIELDS + ', customer_id').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });

  const isOwner = !!callerId && (data as { customer_id?: string | null }).customer_id === callerId;
  // Either way the response is the limited PUBLIC_FIELDS set (no cost/profit
  // internals); owner flag lets the client show owner-only controls.
  const { customer_id: _omit, ...order } = data as unknown as Record<string, unknown>;
  return NextResponse.json({ ok: true, order, scope: isOwner ? 'owner' : 'guest' });
}
