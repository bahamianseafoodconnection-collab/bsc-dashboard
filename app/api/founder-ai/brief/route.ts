// app/api/founder-ai/brief/route.ts
//
// On-demand Founder operational brief — the founder's daily go-to.
//
// GET returns a structured JSON snapshot of the business RIGHT NOW (default:
// today; ?range=today|7d|mtd selectable). Founder/co-founder only — gated with
// the same bearer -> getUser -> profiles.role pattern as the reconcile route.
//
// Profit is computed the HONEST way, not from a flat-margin estimate:
//   - gross profit  = SUM(order_cogs_lines.line_revenue) - SUM(line_cogs)
//                     (real per-line revenue minus real supplier cost, captured
//                      by the bsc_capture_order_cogs trigger on every order)
//   - net profit    = SUM(orders.net_profit)  (the trigger's net: gross minus
//                      overhead allocation minus Bill Casale 5%)
//   - cost_confidence flags revenue that sits on lines with NO cost (unit_cost=0:
//                      either no product_id or no current product_costs row), so
//                      the founder knows when the margin number is optimistic.
//
// Sections returned:
//   summary   — orders, revenue, gross profit, net profit, margin %, confidence
//   sales     — wholesale vs retail split, plus per-channel breakdown
//   customers — who bought today + what they spent + returning/new
//   suppliers — per-supplier revenue / COGS / gross profit / qty (supplier share)
//   pos       — per-cashier drawer (Claf / Curlene): cash/card/wire + variance
//   reorder   — low-stock products that need a PO (links to /purchase-orders)
//   meta      — orders still awaiting reconciliation (the honesty flag)
//
// BSC-only. This endpoint never reads or exposes any Sentinel data.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = ['founder', 'co_founder'];
const WALK_IN_ID = '00000000-0000-0000-0000-000000000001';

// ---- range helpers ----------------------------------------------------------

function rangeBounds(range: string): { fromIso: string; toIso: string; label: string } {
  const now = new Date();
  const to = new Date(now); to.setUTCHours(23, 59, 59, 999);
  const from = new Date(now);
  if (range === '7d') {
    from.setUTCDate(from.getUTCDate() - 6); from.setUTCHours(0, 0, 0, 0);
    return { fromIso: from.toISOString(), toIso: to.toISOString(), label: 'Last 7 days' };
  }
  if (range === 'mtd') {
    from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    return { fromIso: from.toISOString(), toIso: to.toISOString(), label: 'Month to date' };
  }
  from.setUTCHours(0, 0, 0, 0);
  return { fromIso: from.toISOString(), toIso: to.toISOString(), label: 'Today' };
}

function money(cents: number): number { return Math.round(cents) / 100; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

// ---- auth -------------------------------------------------------------------

interface AuthOk { ok: true; admin: SupabaseClient; role: string; userId: string; }
interface AuthErr { ok: false; status: number; error: string; }

async function authorize(req: NextRequest): Promise<AuthOk | AuthErr> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !anon || !svc) return { ok: false, status: 500, error: 'Supabase env missing' };

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Missing bearer token' };

  // Caller-bound client → identify the user.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return { ok: false, status: 401, error: 'Invalid session' };

  // Service-role client → read the role + the data (bypasses RLS on cogs/orders).
  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (profile?.role ?? '').toString();
  if (!FOUNDER_ROLES.includes(role)) {
    return { ok: false, status: 403, error: 'Founder/co-founder access only' };
  }
  return { ok: true, admin, role, userId: user.id };
}

// ---- types ------------------------------------------------------------------

interface OrderRow {
  id: string; created_at: string; customer_id: string | null; customer_name: string | null;
  total: number | null; net_profit: number | null; order_type: string | null;
  channel: string | null; payment_method: string | null; payment_status: string | null;
}

interface CogsRow {
  order_id: string; supplier_name: string | null; product_name: string | null;
  channel: string | null; qty: number | null; unit_cost: number | null;
  line_cogs: number | null; line_revenue: number | null;
}

// ---- main -------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { admin } = auth;

  const range = (req.nextUrl.searchParams.get('range') ?? 'today').toLowerCase();
  const { fromIso, toIso, label } = rangeBounds(range);

  // 1) Orders in range -------------------------------------------------------
  const { data: ordsData } = await admin
    .from('orders')
    .select('id, created_at, customer_id, customer_name, total, net_profit, order_type, channel, payment_method, payment_status')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false });
  const orders = (ordsData ?? []) as OrderRow[];
  const orderIds = orders.map(o => o.id);

  // 2) COGS lines for those orders (TRUE profit + supplier share) -------------
  let cogs: CogsRow[] = [];
  if (orderIds.length > 0) {
    const { data: cogsData } = await admin
      .from('order_cogs_lines')
      .select('order_id, supplier_name, product_name, channel, qty, unit_cost, line_cogs, line_revenue')
      .in('order_id', orderIds);
    cogs = (cogsData ?? []) as CogsRow[];
  }

  const sumRevenue = cogs.reduce((s, r) => s + Number(r.line_revenue ?? 0), 0);
  const sumCogs = cogs.reduce((s, r) => s + Number(r.line_cogs ?? 0), 0);
  const grossProfit = round2(sumRevenue - sumCogs);

  // Cost confidence: revenue sitting on lines with zero captured cost.
  const noCostRevenue = round2(
    cogs.filter(r => Number(r.unit_cost ?? 0) === 0).reduce((s, r) => s + Number(r.line_revenue ?? 0), 0),
  );
  const orderTotalRevenue = round2(orders.reduce((s, o) => s + Number(o.total ?? 0), 0));
  const netProfit = round2(orders.reduce((s, o) => s + Number(o.net_profit ?? 0), 0));
  const ordersMissingNet = orders.filter(o => o.net_profit == null).length;

  // 3) Sales split: wholesale vs retail + per-channel -------------------------
  const isWholesale = (o: OrderRow) => {
    const t = `${o.order_type ?? ''} ${o.channel ?? ''}`.toLowerCase();
    return t.includes('wholesale');
  };
  const wholesale = orders.filter(isWholesale);
  const retail = orders.filter(o => !isWholesale(o));
  const channelMap = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const key = o.channel ?? o.order_type ?? 'unknown';
    const e = channelMap.get(key) ?? { orders: 0, revenue: 0 };
    e.orders += 1; e.revenue += Number(o.total ?? 0);
    channelMap.set(key, e);
  }
  const byChannel = Array.from(channelMap.entries())
    .map(([channel, v]) => ({ channel, orders: v.orders, revenue: round2(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // 4) Customers + what they ordered -----------------------------------------
  const custIds = Array.from(new Set(
    orders.map(o => o.customer_id).filter((id): id is string => !!id && id !== WALK_IN_ID),
  ));
  const custInfo = new Map<string, { full_name: string | null; first_seen_at: string | null }>();
  if (custIds.length > 0) {
    const { data } = await admin.from('customers')
      .select('id, full_name, first_seen_at').in('id', custIds);
    for (const c of (data ?? []) as Array<{ id: string; full_name: string | null; first_seen_at: string | null }>) {
      custInfo.set(c.id, { full_name: c.full_name, first_seen_at: c.first_seen_at });
    }
  }
  const fromMs = new Date(fromIso).getTime();
  // product names per customer come from the cogs lines
  const productsByOrder = new Map<string, string[]>();
  for (const r of cogs) {
    if (!r.product_name) continue;
    const arr = productsByOrder.get(r.order_id) ?? [];
    if (!arr.includes(r.product_name)) arr.push(r.product_name);
    productsByOrder.set(r.order_id, arr);
  }
  const customers = custIds.map(cid => {
    const info = custInfo.get(cid);
    const my = orders.filter(o => o.customer_id === cid);
    const items = Array.from(new Set(my.flatMap(o => productsByOrder.get(o.id) ?? [])));
    const firstSeenMs = info?.first_seen_at ? new Date(info.first_seen_at).getTime() : fromMs;
    return {
      name: info?.full_name ?? my[0]?.customer_name ?? '(unknown)',
      orders: my.length,
      revenue: round2(my.reduce((s, o) => s + Number(o.total ?? 0), 0)),
      products: items.slice(0, 8),
      is_returning: firstSeenMs < fromMs,
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const walkInOrders = orders.filter(o => o.customer_id === WALK_IN_ID).length;

  // 5) Supplier share (origins / spend / profit) -----------------------------
  const supMap = new Map<string, { revenue: number; cogs: number; qty: number; lines: number }>();
  for (const r of cogs) {
    const key = r.supplier_name ?? '(no supplier / brand line)';
    const e = supMap.get(key) ?? { revenue: 0, cogs: 0, qty: 0, lines: 0 };
    e.revenue += Number(r.line_revenue ?? 0);
    e.cogs += Number(r.line_cogs ?? 0);
    e.qty += Number(r.qty ?? 0);
    e.lines += 1;
    supMap.set(key, e);
  }
  const suppliers = Array.from(supMap.entries())
    .map(([supplier, v]) => ({
      supplier,
      revenue: round2(v.revenue),
      cogs: round2(v.cogs),
      gross_profit: round2(v.revenue - v.cogs),
      qty: round2(v.qty),
      lines: v.lines,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // 6) POS drawers (Claf / Curlene) via cash_drawer_session_totals view -------
  const { data: openRows } = await admin
    .from('cash_drawer_session_totals')
    .select('*').eq('status', 'open').order('opened_at', { ascending: false });
  const { data: closedRows } = await admin
    .from('cash_drawer_session_totals')
    .select('*').eq('status', 'closed')
    .gte('closed_at', fromIso).lte('closed_at', toIso)
    .order('closed_at', { ascending: false });
  const sessions = [...((openRows ?? []) as Record<string, unknown>[]), ...((closedRows ?? []) as Record<string, unknown>[])];

  const cashierIds = Array.from(new Set(sessions.map(s => s.cashier_user_id as string).filter(Boolean)));
  const nameById = new Map<string, string>();
  if (cashierIds.length > 0) {
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', cashierIds);
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? '(cashier)');
    }
  }
  const pos = sessions.map(s => {
    const openingFloat = Number(s.opening_float_cents ?? 0);
    const cashSales = Number(s.cash_sales_cents ?? 0);
    const counted = s.closing_cash_counted_cents == null ? null : Number(s.closing_cash_counted_cents);
    const expected = openingFloat + cashSales;
    return {
      cashier: nameById.get(s.cashier_user_id as string) ?? '(cashier)',
      location: (s.location as string) ?? null,
      status: (s.status as string) ?? null,
      orders: Number(s.order_count ?? 0),
      cash_sales: money(cashSales),
      card_sales: money(Number(s.card_sales_cents ?? 0)),
      wire_sales: money(Number(s.wire_sales_cents ?? 0)),
      account_sales: money(Number(s.account_sales_cents ?? 0)),
      total_sales: money(Number(s.total_sales_cents ?? 0)),
      opening_float: money(openingFloat),
      expected_cash: money(expected),
      counted_cash: counted == null ? null : money(counted),
      variance: s.variance_cents == null ? null : money(Number(s.variance_cents)),
    };
  });
  const cardTakings = round2(pos.reduce((s, p) => s + p.card_sales, 0));

  // 7) Inventory reorder needs -----------------------------------------------
  // Pull products flagged low-stock. Schema-tolerant: select * and read common
  // threshold fields; if none present we just return the low_stock flag set.
  let reorder: Array<{ name: string | null; sku: string | null; on_hand: number | null; reorder_point: number | null }> = [];
  try {
    const { data: low } = await admin
      .from('products')
      .select('id, name, sku, stock_qty, reorder_point, low_stock')
      .or('low_stock.eq.true,and(reorder_point.gt.0,stock_qty.lte.reorder_point)')
      .limit(40);
    reorder = ((low ?? []) as Array<{ name: string | null; sku: string | null; stock_qty: number | null; reorder_point: number | null }>)
      .map(p => ({ name: p.name, sku: p.sku, on_hand: p.stock_qty, reorder_point: p.reorder_point }));
  } catch {
    reorder = [];
  }

  // 8) Meta: orders still awaiting reconciliation (honesty flag) --------------
  const { count: awaitingRecon } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('payment_status', 'payment_pending');

  const marginPct = orderTotalRevenue > 0 ? round2((grossProfit / orderTotalRevenue) * 100) : 0;

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    range: { key: range, label, from: fromIso, to: toIso },

    summary: {
      orders: orders.length,
      revenue: orderTotalRevenue,
      cogs_revenue_basis: round2(sumRevenue),
      gross_profit: grossProfit,
      gross_margin_pct: marginPct,
      net_profit: netProfit,
      cost_confidence: {
        revenue_without_cost: noCostRevenue,
        note: noCostRevenue > 0
          ? 'Some revenue sits on lines with no captured supplier cost (no product link or no cost row) — gross profit is optimistic by up to this amount.'
          : 'All revenue lines have captured supplier cost.',
        orders_missing_net_profit: ordersMissingNet,
      },
    },

    sales: {
      wholesale: { orders: wholesale.length, revenue: round2(wholesale.reduce((s, o) => s + Number(o.total ?? 0), 0)) },
      retail: { orders: retail.length, revenue: round2(retail.reduce((s, o) => s + Number(o.total ?? 0), 0)) },
      by_channel: byChannel,
    },

    customers: {
      identified: customers.length,
      returning: customers.filter(c => c.is_returning).length,
      new: customers.filter(c => !c.is_returning).length,
      walk_in_orders: walkInOrders,
      list: customers.slice(0, 30),
    },

    suppliers,

    pos: {
      sessions: pos,
      card_takings_total: cardTakings,
    },

    reorder,

    meta: {
      orders_awaiting_reconciliation: awaitingRecon ?? 0,
      scope: 'BSC only — no Sentinel data is read or exposed by this brief.',
    },
  });
}
