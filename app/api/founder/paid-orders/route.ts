// /api/founder/paid-orders?date=YYYY-MM-DD   (or ?start=YYYY-MM-DD&end=YYYY-MM-DD)
//
// Pillar 2 — RBC-approved ONLINE paid orders, grouped by the supplier each line
// sources from, ready to route. ONLY payment_status='paid' (the value the RBC
// Plug'n Pay return-handler writes on an approved card) is "route-ready". Orders
// that are pending / declined / failed are returned SEPARATELY under not_paid so
// they are never sent to a supplier.
//
// POS sales (pos_sale_*) and phone orders are excluded — this is online only.
// Supplier per line comes from the order_cogs_lines ledger (captured at order
// insert); lines with no resolved supplier group under "Unassigned".
//
// Service-role read (orders is RLS-locked). Auth: founder/co_founder/admins/manager.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = adminClient();
  if (!supaUrl || !anonKey || !admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ADMIN_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Admin role required.' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const start = (sp.get('start') || sp.get('date') || today).slice(0, 10);
  const end = (sp.get('end') || sp.get('date') || today).slice(0, 10);

  // Online orders in range, excluding POS + phone orders.
  const { data: orders, error: oErr } = await admin
    .from('orders')
    .select('id, created_at, customer_name, customer_phone, customer_address, delivery_type, order_type, payment_status, payment_method, total')
    .gte('created_at', `${start}T00:00:00-05:00`)
    .lt('created_at', `${end}T24:00:00-04:00`)
    .not('order_type', 'ilike', 'pos_sale%')
    .neq('order_type', 'phone_order')
    .order('created_at', { ascending: false });
  if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

  type O = { id: string; created_at: string; customer_name: string | null; customer_phone: string | null; customer_address: string | null; delivery_type: string | null; order_type: string | null; payment_status: string | null; payment_method: string | null; total: number | null };
  const all = (orders ?? []) as O[];
  const paid = all.filter((o) => (o.payment_status ?? '').toLowerCase() === 'paid');
  const notPaid = all.filter((o) => (o.payment_status ?? '').toLowerCase() !== 'paid');

  // Supplier-per-line for the paid orders, from the COGS ledger.
  const paidIds = paid.map((o) => o.id);
  type CogsLine = { order_id: string; supplier_name: string | null; product_name: string | null; qty: number | null; unit_price: number | null; line_revenue: number | null; line_cogs: number | null };
  let cogs: CogsLine[] = [];
  if (paidIds.length > 0) {
    const { data: cl } = await admin
      .from('order_cogs_lines')
      .select('order_id, supplier_name, product_name, qty, unit_price, line_revenue, line_cogs')
      .in('order_id', paidIds);
    cogs = (cl ?? []) as CogsLine[];
  }

  const orderById = new Map(paid.map((o) => [o.id, o]));
  const groups = new Map<string, { supplier_name: string; lines: Array<Record<string, unknown>>; revenue: number; cogs: number }>();
  for (const l of cogs) {
    const key = l.supplier_name || 'Unassigned';
    const g = groups.get(key) ?? { supplier_name: key, lines: [], revenue: 0, cogs: 0 };
    const o = orderById.get(l.order_id);
    g.lines.push({
      order_id: l.order_id,
      order_ref: l.order_id.slice(0, 8).toUpperCase(),
      customer: o?.customer_name ?? '',
      destination: o?.customer_address ?? o?.delivery_type ?? '',
      product_name: l.product_name ?? '',
      qty: Number(l.qty ?? 0),
      unit_price: Number(l.unit_price ?? 0),
      revenue: Number(l.line_revenue ?? 0),
      cogs: Number(l.line_cogs ?? 0),
    });
    g.revenue += Number(l.line_revenue ?? 0);
    g.cogs += Number(l.line_cogs ?? 0);
    groups.set(key, g);
  }

  const suppliers = Array.from(groups.values())
    .map((g) => ({ ...g, profit: Number((g.revenue - g.cogs).toFixed(2)), revenue: Number(g.revenue.toFixed(2)), cogs: Number(g.cogs.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({
    ok: true,
    range: { start, end },
    suppliers,
    paid_count: paid.length,
    not_paid: notPaid.map((o) => ({ order_ref: o.id.slice(0, 8).toUpperCase(), customer: o.customer_name, status: o.payment_status, payment_method: o.payment_method, total: Number(o.total ?? 0), created_at: o.created_at })),
    totals: {
      paid_revenue: Number(paid.reduce((s, o) => s + Number(o.total ?? 0), 0).toFixed(2)),
      supplier_count: suppliers.length,
    },
  });
}
