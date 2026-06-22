// /api/driver/pickups
//
// A driver's assigned, not-yet-confirmed supplier pickups (per-supplier POs).
// Each carries supplier name, the products to verify (name + SKU + COST), the
// delivery target ("Spiny Tail" for POS sales, the customer for online), and
// the parent order ref. The driver confirms each on-site via
// /api/fulfillment/confirm-po. Drivers see their own; founder/managers see ALL
// unconfirmed pickups (oversight / testing).
//
// Resp: { ok, pickups: [{ po_id, supplier_name, deliver_to, deliver_label,
//          order_ref, total_cost, items:[{name,sku,qty,unit,cost}] }] }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DRIVER_ROLES = new Set(['driver', 'operations']);
const OVERSIGHT_ROLES = new Set(['founder', 'co_founder', 'manager', 'control_admin', 'basic_admin']);

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
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  const isDriver = !!role && DRIVER_ROLES.has(role);
  const isOversight = !!role && OVERSIGHT_ROLES.has(role);
  if (!isDriver && !isOversight) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" has no pickups.` }, { status: 403 });
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let q = admin.from('purchase_orders')
    .select('id, order_id, supplier_name, deliver_to, total, driver_assigned_to')
    .is('supplier_confirmed_at', null)
    .order('created_at', { ascending: true });
  // Drivers see only their own assigned pickups; oversight roles see all.
  if (!isOversight) q = q.eq('driver_assigned_to', user.id);

  const { data: poRows } = await q;
  const pos = (poRows ?? []) as Array<{ id: string; order_id: string | null; supplier_name: string | null; deliver_to: string | null; total: number | null; driver_assigned_to: string | null }>;
  if (pos.length === 0) return NextResponse.json({ ok: true, pickups: [] });

  const poIds = pos.map((p) => p.id);
  const orderIds = [...new Set(pos.map((p) => p.order_id).filter((x): x is string => !!x))];

  const [{ data: items }, { data: orders }] = await Promise.all([
    admin.from('purchase_order_items').select('po_id, product_id, units_ordered, weight_lb, unit_cost').in('po_id', poIds),
    orderIds.length
      ? admin.from('orders').select('id, order_type, customer_name, customer_address').in('id', orderIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const itemRows = (items ?? []) as Array<{ po_id: string; product_id: string | null; units_ordered: number | null; weight_lb: number | null; unit_cost: number | null }>;
  const orderMap = new Map<string, { order_type: string | null; customer_name: string | null; customer_address: string | null }>();
  for (const o of (orders ?? []) as Array<{ id: string; order_type: string | null; customer_name: string | null; customer_address: string | null }>) {
    orderMap.set(o.id, { order_type: o.order_type, customer_name: o.customer_name, customer_address: o.customer_address });
  }

  const productIds = [...new Set(itemRows.map((i) => i.product_id).filter((x): x is string => !!x))];
  const { data: prods } = productIds.length
    ? await admin.from('products').select('id, name, sku').in('id', productIds)
    : { data: [] as unknown[] };
  const prodMap = new Map<string, { name: string | null; sku: string | null }>();
  for (const p of (prods ?? []) as Array<{ id: string; name: string | null; sku: string | null }>) {
    prodMap.set(p.id, { name: p.name, sku: p.sku });
  }

  const pickups = pos.map((po) => {
    const ord = po.order_id ? orderMap.get(po.order_id) : undefined;
    const spiny = po.deliver_to === 'spiny_tail';
    return {
      po_id:         po.id,
      supplier_name: po.supplier_name ?? 'Unassigned supplier',
      deliver_to:    po.deliver_to ?? 'customer',
      deliver_label: spiny ? 'DELIVER TO SPINY TAIL' : (ord?.customer_address || ord?.customer_name || 'Customer delivery'),
      order_ref:     po.order_id ? po.order_id.slice(0, 8).toUpperCase() : '—',
      total_cost:    Number(po.total ?? 0),
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
    };
  });

  return NextResponse.json({ ok: true, pickups });
}
