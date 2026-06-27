// /api/phone-orders/create
//
// Staff "order by phone" entry. Inserts a PENDING phone order — NO inventory
// impact, NO supplier routing, NO payment taken. It sits in the founder
// approval queue until approved (see /api/phone-orders/[id]/approve).
//
// Why this is safe to insert as-is:
//   • status='pending_approval' (not 'completed') → the inventory-deduct trigger
//     (which fires only WHEN status='completed') never runs.
//   • payment_status='unpaid' → guard_order_paid_on_insert + the points trigger
//     do not fire.
//   • Lines live in wholesale_items (like POS); the inventory trigger reads
//     `items` (null here) so it is inert for this order even later.
//   • COGS capture DOES run at insert (reads wholesale_items) — that is fine:
//     all profit/inventory reports filter to approved/completed status, so a
//     pending order contributes nothing until it's approved.
//
// Body: { customer_name, customer_phone?, payment_type: 'cod'|'transfer'|'credit',
//         entered_by_name?, items: [{ product_id, name, sku?, qty, unit?, unit_price }] }
// Service-role insert. Allowed: founder/co_founder/manager/admins/cashier/andros_staff.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'founder', 'co_founder', 'control_admin', 'basic_admin', 'manager',
  'cashier', 'andros_staff',
]);
const PAYMENT_TYPES = new Set(['cod', 'transfer', 'credit']);

type LineIn = { product_id?: unknown; name?: unknown; sku?: unknown; qty?: unknown; unit?: unknown; unit_price?: unknown };

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot enter phone orders.` }, { status: 403 });

  let b: { customer_name?: unknown; customer_phone?: unknown; payment_type?: unknown; entered_by_name?: unknown; items?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const customerName = typeof b.customer_name === 'string' ? b.customer_name.trim() : '';
  const customerPhone = typeof b.customer_phone === 'string' ? b.customer_phone.trim() : '';
  const paymentType = typeof b.payment_type === 'string' ? b.payment_type : '';
  if (!customerName) return NextResponse.json({ ok: false, error: 'Customer name required' }, { status: 400 });
  if (!PAYMENT_TYPES.has(paymentType)) return NextResponse.json({ ok: false, error: "payment_type must be 'cod', 'transfer', or 'credit'" }, { status: 400 });

  const rawItems = Array.isArray(b.items) ? (b.items as LineIn[]) : [];
  const items = rawItems.map((it) => {
    const qty = Number(it.qty);
    const unitPrice = Number(it.unit_price);
    return {
      product_id: typeof it.product_id === 'string' ? it.product_id : null,
      name: typeof it.name === 'string' ? it.name : 'Item',
      sku: typeof it.sku === 'string' ? it.sku : null,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
      unit: typeof it.unit === 'string' ? it.unit : 'each',
      unit_price: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
      line_total: Number(((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0)).toFixed(2)),
    };
  }).filter((l) => l.qty > 0);

  if (items.length === 0) return NextResponse.json({ ok: false, error: 'Add at least one product line with a quantity.' }, { status: 400 });

  const total = Number(items.reduce((s, l) => s + l.line_total, 0).toFixed(2));
  const enteredBy = (typeof b.entered_by_name === 'string' && b.entered_by_name.trim())
    || (prof as { full_name?: string | null } | null)?.full_name || role;
  const paymentMethodMap: Record<string, string> = { cod: 'cash', transfer: 'transfer', credit: 'account' };

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const row: Record<string, unknown> = {
    order_type:      'phone_order',
    status:          'pending_approval',
    payment_status:  'unpaid',
    payment_type:    paymentType,                       // cod | transfer | credit (founder sees before approving)
    payment_method:  paymentMethodMap[paymentType],
    wholesale_items: items,
    subtotal:        total,
    vat_amount:      0,
    total,
    customer_name:   customerName,
    customer_phone:  customerPhone || null,
    admin_notes:     `Phone order entered by ${enteredBy}`,
  };

  const { data, error } = await admin.from('orders').insert(row).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: `Could not save phone order: ${error.message}` }, { status: 500 });
  const orderId = (data as { id: string }).id;

  try {
    await admin.from('ai_writes').insert({
      tool: 'phone_order_create', caller_id: user.id,
      input: { customer_name: customerName, payment_type: paymentType, lines: items.length, total },
      result: { order_id: orderId, status: 'pending_approval' }, status: 'success', error: null,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, order_id: orderId, total, status: 'pending_approval' });
}
