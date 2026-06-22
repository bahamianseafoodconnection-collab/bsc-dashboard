// /api/fulfillment/pick-tickets/[orderId]
//
// Assembles the PER-SUPPLIER pick tickets for one customer order (Pick-ticket +
// driver fulfillment, Phase 1). One ticket per supplier the order sources from —
// each carries supplier name, product name + SKU, and the COST price BSC pays,
// plus the delivery target:
//   • POS sales (order_type starts 'pos_sale') → "DELIVER TO SPINY TAIL"
//   • online sales                             → the customer's delivery address
//
// Source of truth = the auto-raised purchase_orders + purchase_order_items for
// the order (per-supplier, cost already snapshotted). Product name/SKU are
// joined from products. Staff/founder only; service-role read.
//
// Resp: { ok, order: {...}, deliver_to, tickets: [{ po_id, supplier_name, items:[{name,sku,qty,unit,cost}] }] }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set([
  'founder', 'co_founder', 'manager', 'control_admin', 'basic_admin',
  'driver', 'operations', 'cashier', 'andros_staff',
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
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
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot view pick tickets.` }, { status: 403 });
  }
  if (!orderId) return NextResponse.json({ ok: false, error: 'order id required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Parent order — drives the delivery target.
  const { data: order } = await admin
    .from('orders')
    .select('id, order_type, status, payment_status, customer_name, customer_phone, customer_address, delivery_type, created_at')
    .eq('id', orderId)
    .maybeSingle<{
      id: string; order_type: string | null; status: string | null; payment_status: string | null;
      customer_name: string | null; customer_phone: string | null; customer_address: string | null;
      delivery_type: string | null; created_at: string;
    }>();
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });

  const isPos = (order.order_type ?? '').startsWith('pos_sale');
  const deliverTo = isPos
    ? { kind: 'spiny_tail' as const, label: 'DELIVER TO SPINY TAIL PROCESSING' }
    : { kind: 'customer' as const, label: order.customer_address || 'Customer delivery — see order',
        name: order.customer_name, phone: order.customer_phone };

  // Per-supplier purchase orders for this order.
  const { data: pos } = await admin
    .from('purchase_orders')
    .select('id, supplier_id, supplier_name, total, status, payment_status')
    .eq('order_id', orderId);

  const poList = (pos ?? []) as Array<{ id: string; supplier_id: string | null; supplier_name: string | null; total: number | null; status: string | null; payment_status: string | null }>;

  // Items for all POs in one go, then product name/sku in one lookup.
  const poIds = poList.map((p) => p.id);
  const { data: items } = poIds.length
    ? await admin.from('purchase_order_items')
        .select('po_id, product_id, units_ordered, weight_lb, unit_cost, total_cost')
        .in('po_id', poIds)
    : { data: [] as unknown[] };
  const itemRows = (items ?? []) as Array<{ po_id: string; product_id: string | null; units_ordered: number | null; weight_lb: number | null; unit_cost: number | null; total_cost: number | null }>;

  const productIds = [...new Set(itemRows.map((i) => i.product_id).filter((x): x is string => !!x))];
  const { data: prods } = productIds.length
    ? await admin.from('products').select('id, name, sku').in('id', productIds)
    : { data: [] as unknown[] };
  const prodMap = new Map<string, { name: string | null; sku: string | null }>();
  for (const p of (prods ?? []) as Array<{ id: string; name: string | null; sku: string | null }>) {
    prodMap.set(p.id, { name: p.name, sku: p.sku });
  }

  const tickets = poList.map((po) => ({
    po_id:         po.id,
    supplier_name: po.supplier_name ?? 'Unassigned supplier',
    total_cost:    Number(po.total ?? 0),
    payment_status: po.payment_status ?? 'unpaid',
    items: itemRows.filter((i) => i.po_id === po.id).map((i) => {
      const prod = i.product_id ? prodMap.get(i.product_id) : undefined;
      return {
        name: prod?.name ?? 'Item',
        sku:  prod?.sku ?? '—',
        qty:  i.weight_lb != null && i.weight_lb > 0 ? i.weight_lb : Number(i.units_ordered ?? 0),
        unit: i.weight_lb != null && i.weight_lb > 0 ? 'lb' : 'unit',
        cost: Number(i.unit_cost ?? 0),
      };
    }),
  }));

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id, order_type: order.order_type, status: order.status,
      payment_status: order.payment_status, created_at: order.created_at,
    },
    deliver_to: deliverTo,
    tickets,
  });
}
