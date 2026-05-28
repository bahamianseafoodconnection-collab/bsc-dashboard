// POST /api/orders/place
//
// Service-role order creation for the online checkout flow. Needed because
// the orders RLS lockdown (20260528120000) scopes the SELECT policy to
// owner/staff — so a client `insert(order).select('id')` succeeds at the
// INSERT but the RETURNING select is blocked (checkout's customer_id is a
// customers-table record, not the buyer's auth uid), leaving checkout with
// a null order id → "Order not found" at payment start.
//
// This inserts with the service role (bypasses RLS) and returns the id.
// It also FORCES payment_status server-side from payment_method, so a
// client can never create an order pre-marked paid (online orders become
// paid only via the service-role payment APIs after RBC verification).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Columns the online create flow is allowed to set. Anything else in the
// body is ignored (no arbitrary column injection). payment_status + status
// are forced below, never taken from the client.
const ALLOWED = new Set([
  'order_type', 'channel', 'location', 'payment_method',
  'customer_name', 'customer_phone', 'customer_address', 'customer_id',
  'delivery_type', 'delivery_address', 'delivery_directions', 'delivery_lat', 'delivery_lng',
  'admin_notes', 'wholesale_items', 'wholesale_cost_total', 'items',
  'subtotal', 'vat_amount', 'total', 'promo_code', 'promo_discount',
  'expense_allocation', 'bill_casale_share', 'net_profit', 'fulfillment_status',
]);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  // Whitelist incoming fields
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) row[k] = v;
  }

  // Validate: must have items and a positive total.
  const hasItems = Array.isArray(row.items) ? (row.items as unknown[]).length > 0
                 : Array.isArray(row.wholesale_items) ? (row.wholesale_items as unknown[]).length > 0
                 : false;
  const total = Number(row.total);
  if (!hasItems) return NextResponse.json({ ok: false, error: 'No items in order' }, { status: 400 });
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid order total' }, { status: 400 });
  }

  // Force server-controlled fields (never trust the client for these).
  const payMethod = String(row.payment_method ?? 'cod');
  row.order_type     = row.order_type ?? 'online_market';
  row.status         = 'pending';
  row.payment_status = payMethod === 'card' ? 'payment_pending' : 'pending';
  row.fulfillment_status = 'placed';

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.from('orders').insert(row).select('id').single();
  if (error) {
    return NextResponse.json({ ok: false, error: `Order create failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order_id: (data as { id: string }).id });
}
