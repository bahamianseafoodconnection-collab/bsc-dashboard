// /api/dashboard/daily-sales-report?date=YYYY-MM-DD
//
// Service-role daily sales report. Lists every line item sold on
// the given date (Bahamas time) with supplier + cost + COGS owed.
// Bypasses RLS entirely because the 'qc' enum cast issue on the
// supplier_* views is blocking client-side reads — service_role
// circumvents that without depending on the view.
//
// Auth: any signed-in staff with role in ADMIN_ROLES (founder,
// co_founder, control_admin, basic_admin, manager).
//
// Returns:
//   {
//     ok: true,
//     date: 'YYYY-MM-DD',
//     rows: [{ time, product_name, sku, qty, unit, supplier_name,
//              cost_per_unit, total_cost, revenue }, ...],
//     totals: { revenue, cogs, order_count, line_count }
//   }

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

interface OrderRow {
  id:                string;
  created_at:        string;
  status:            string | null;
  wholesale_items:   unknown;
}
interface ItemRaw {
  product_id?:  string;
  sku?:         string;
  name?:        string;
  quantity?:    number | string;
  weight_lb?:   number | string | null;
  unit_price?:  number | string;
  line_total?:  number | string;
}
interface ProductRow {
  id:                  string;
  primary_supplier_id: string | null;
}
interface SupplierRow { id: string; name: string }
interface CostRow    { product_id: string; cost_per_unit: number }

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveCaller(req: NextRequest): Promise<{ ok: boolean; role: string | null; error?: string }> {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const header = req.headers.get('authorization') ?? '';
  if (!url || !anon || !header.startsWith('Bearer ')) return { ok: false, role: null, error: 'Sign-in required.' };
  const client = createClient(url, anon, {
    global: { headers: { Authorization: header } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, role: null, error: 'Invalid session.' };
  const { data: prof } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ADMIN_ROLES.has(role)) return { ok: false, role, error: 'Admin role required.' };
  return { ok: true, role };
}

// Compute the Bahamas "today" as YYYY-MM-DD without depending on the
// view we can't read. America/Nassau is UTC-4 / -5 DST.
function bahamasToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Nassau' });
}

export async function GET(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const caller = await resolveCaller(req);
  if (!caller.ok) return NextResponse.json({ ok: false, error: caller.error }, { status: 403 });

  const date = (req.nextUrl.searchParams.get('date') || bahamasToday()).slice(0, 10);
  // Pillar 1 channel scope. Default 'nassau' (Nassau POS daily sales) — can
  // expand to all/andros/online. Filters by orders.order_type.
  const channel = (req.nextUrl.searchParams.get('channel') || 'nassau').toLowerCase();

  // Pull every order on the given Bahamas-local day. Range is
  // computed as the UTC instants that correspond to local 00:00
  // and 24:00 — uses Postgres's AT TIME ZONE in the filter.
  let query = admin
    .from('orders')
    .select('id, created_at, status, wholesale_items')
    .gte('created_at', `${date}T00:00:00-05:00`)  // tz-loose lower bound — keeps the day intact even during DST flips
    .lt ('created_at', `${date}T24:00:00-04:00`)
    .order('created_at', { ascending: true });
  if (channel === 'nassau')      query = query.eq('order_type', 'pos_sale_nassau');
  else if (channel === 'andros') query = query.eq('order_type', 'pos_sale_andros');
  else if (channel === 'online') query = query.not('order_type', 'ilike', 'pos_sale%').neq('order_type', 'phone_order');
  // 'all' → no order_type filter (every channel)
  const { data: orders, error: oErr } = await query;
  if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

  // Flatten the JSON line items into rows we can enrich with product
  // + supplier + cost lookups.
  type Flat = {
    order_id: string; time: string; product_id: string | null; sku: string;
    name: string; qty: number; unit: string; revenue: number;
  };
  const flat: Flat[] = [];
  for (const o of (orders as OrderRow[] | null) ?? []) {
    if (o.status && ['cancelled', 'voided', 'refunded'].includes(o.status.toLowerCase())) continue;
    const items: ItemRaw[] = Array.isArray(o.wholesale_items) ? o.wholesale_items as ItemRaw[] : [];
    for (const it of items) {
      const qty = Number(it.weight_lb ?? it.quantity ?? 1) || 0;
      if (qty <= 0) continue;
      flat.push({
        order_id:   o.id,
        time:       o.created_at,
        product_id: typeof it.product_id === 'string' ? it.product_id : null,
        sku:        String(it.sku ?? ''),
        name:       String(it.name ?? '(unnamed)'),
        qty,
        unit:       it.weight_lb != null && it.weight_lb !== '' ? 'lb' : 'each',
        revenue:    Number(it.line_total ?? 0) || (Number(it.unit_price ?? 0) * qty),
      });
    }
  }

  // Look up product → supplier_id, supplier → name, product → current cost.
  const productIds = Array.from(new Set(flat.map((r) => r.product_id).filter(Boolean) as string[]));
  let productMap: Map<string, string | null> = new Map();
  let supplierNameMap: Map<string, string>   = new Map();
  let costMap: Map<string, number>           = new Map();
  if (productIds.length > 0) {
    const [prodRes, costRes] = await Promise.all([
      admin.from('products').select('id, primary_supplier_id').in('id', productIds),
      admin.from('product_costs').select('product_id, cost_per_unit').eq('is_current', true).in('product_id', productIds),
    ]);
    if (prodRes.error) return NextResponse.json({ ok: false, error: `products: ${prodRes.error.message}` }, { status: 500 });
    if (costRes.error) return NextResponse.json({ ok: false, error: `product_costs: ${costRes.error.message}` }, { status: 500 });
    productMap = new Map(((prodRes.data as ProductRow[]) ?? []).map((p) => [p.id, p.primary_supplier_id]));
    costMap    = new Map(((costRes.data as CostRow[])    ?? []).map((c) => [c.product_id, Number(c.cost_per_unit)]));

    const supplierIds = Array.from(new Set(Array.from(productMap.values()).filter(Boolean) as string[]));
    if (supplierIds.length > 0) {
      const { data: sups, error: sErr } = await admin.from('suppliers').select('id, name').in('id', supplierIds);
      if (sErr) return NextResponse.json({ ok: false, error: `suppliers: ${sErr.message}` }, { status: 500 });
      supplierNameMap = new Map(((sups as SupplierRow[]) ?? []).map((s) => [s.id, s.name]));
    }
  }

  // Aggregate per (supplier, product). One row per unique product
  // within each supplier — qty summed, totals summed.
  type ProductAgg = {
    product_id:    string | null;
    product_name:  string;
    sku:           string;
    qty:           number;
    unit:          string;
    cost_per_unit: number | null;
    total_cost:    number;
    revenue:       number;
  };
  type SupplierAgg = {
    supplier_id:   string | null;
    supplier_name: string;
    total_cost:    number;
    total_revenue: number;
    product_count: number;
    products:      ProductAgg[];
  };

  const supMap = new Map<string, SupplierAgg>();
  const orderIds = new Set<string>();

  for (const r of flat) {
    orderIds.add(r.order_id);
    const supId = r.product_id ? (productMap.get(r.product_id) ?? null) : null;
    const supKey = supId ?? '__none__';
    const cost   = r.product_id ? (costMap.get(r.product_id) ?? null) : null;
    const lineCost = cost != null ? cost * r.qty : 0;

    if (!supMap.has(supKey)) {
      supMap.set(supKey, {
        supplier_id:   supId,
        supplier_name: supId ? (supplierNameMap.get(supId) ?? '— unknown —') : '— No supplier on file —',
        total_cost:    0,
        total_revenue: 0,
        product_count: 0,
        products:      [],
      });
    }
    const sup = supMap.get(supKey)!;

    // Find or create the product row within this supplier
    const prodKey = r.product_id ?? `name:${r.name}`;
    let prod = sup.products.find((p) => (p.product_id ?? `name:${p.product_name}`) === prodKey);
    if (!prod) {
      prod = {
        product_id:    r.product_id,
        product_name:  r.name,
        sku:           r.sku,
        qty:           0,
        unit:          r.unit,
        cost_per_unit: cost,
        total_cost:    0,
        revenue:       0,
      };
      sup.products.push(prod);
    }
    prod.qty        += r.qty;
    prod.total_cost += lineCost;
    prod.revenue    += r.revenue;
    sup.total_cost    += lineCost;
    sup.total_revenue += r.revenue;
  }

  // Sort suppliers by total_cost desc; products within each by total_cost desc.
  // Round all numeric outputs to 2dp.
  const suppliers: SupplierAgg[] = Array.from(supMap.values())
    .map((s) => ({
      ...s,
      total_cost:    Number(s.total_cost.toFixed(2)),
      total_revenue: Number(s.total_revenue.toFixed(2)),
      product_count: s.products.length,
      products: s.products
        .map((p) => ({
          ...p,
          qty:        Number(p.qty.toFixed(2)),
          total_cost: Number(p.total_cost.toFixed(2)),
          revenue:    Number(p.revenue.toFixed(2)),
        }))
        .sort((a, b) => b.total_cost - a.total_cost),
    }))
    .sort((a, b) => b.total_cost - a.total_cost);

  const totalRevenue = suppliers.reduce((s, x) => s + x.total_revenue, 0);
  const totalCogs    = suppliers.reduce((s, x) => s + x.total_cost,    0);

  return NextResponse.json({
    ok:        true,
    date,
    suppliers,
    totals: {
      revenue:        Number(totalRevenue.toFixed(2)),
      cogs:           Number(totalCogs.toFixed(2)),
      supplier_count: suppliers.length,
      product_count:  suppliers.reduce((s, x) => s + x.product_count, 0),
      order_count:    orderIds.size,
    },
  });
}
