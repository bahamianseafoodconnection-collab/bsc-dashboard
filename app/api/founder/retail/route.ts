// /api/founder/retail
//
// Retail Online Market analytics (founder-only). Channel-scoped to the retail
// online channel (enum value 'online_market' — display name "Retail Online
// Market"). Read-only: computes case→unit economics, sales velocity (fast/slow
// movers), supplier price changes, and reorder recommendations from LIVE data.
//
// Does NOT change any pricing math, margins, or the channel enum. Service-role
// (bypasses RLS); every block defensive → never 500s the dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const CHANNEL = 'online_market';
const r2 = (n: number) => Math.round(n * 100) / 100;

async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try { const { data, error } = await p; return error ? [] : (data ?? []); } catch { return []; }
}
function daysAgoISO(d: number) {
  const t = new Date(); t.setDate(t.getDate() - d); return t.toISOString();
}

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only.' }, { status: 403 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) Retail products (online_market, active)
  const products = await safe<{ id: string; name: string; primary_supplier_id: string | null; units_per_case: number | null; stock_count: number | null; low_stock_threshold: number | null; pack_size: string | null; unit_of_measure: string | null }>(
    admin.from('products').select('id, name, primary_supplier_id, units_per_case, stock_count, low_stock_threshold, pack_size, unit_of_measure')
      .eq('sell_online', true).eq('status', 'active'));
  const ids = products.map(p => p.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, channel_label: 'Retail Online Market', products: [], movers: { fast: [], slow: [] }, price_changes: [], reorders: [], alerts: [], summary: { products: 0, units_sold_30d: 0, revenue_30d: 0, profit_30d: 0 } });

  // 2) Current unit cost + retail price (chunked)
  const costMap: Record<string, number> = {};
  const priceMap: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const [costs, prices] = await Promise.all([
      safe<{ product_id: string; cost_per_unit: number | null }>(admin.from('product_costs').select('product_id, cost_per_unit').in('product_id', slice).eq('is_current', true)),
      safe<{ product_id: string; manual_unit_price: number | null }>(admin.from('product_pricing').select('product_id, manual_unit_price').in('product_id', slice).eq('channel', CHANNEL).eq('is_current', true).eq('is_active', true)),
    ]);
    for (const c of costs) if (c.cost_per_unit != null) costMap[c.product_id] = Number(c.cost_per_unit);
    for (const p of prices) if (p.manual_unit_price != null) priceMap[p.product_id] = Number(p.manual_unit_price);
  }

  // 3) Sales velocity from order_cogs_lines (online_market) over 30d, bucketed.
  const lines = await safe<{ product_id: string; qty: number | null; line_revenue: number | null; line_cogs: number | null; sold_at: string | null }>(
    admin.from('order_cogs_lines').select('product_id, qty, line_revenue, line_cogs, sold_at').eq('channel', CHANNEL).gte('sold_at', daysAgoISO(30)));
  const d7 = daysAgoISO(7), d1 = daysAgoISO(1);
  const sales: Record<string, { u30: number; u7: number; u1: number; rev: number; profit: number }> = {};
  let units30 = 0, rev30 = 0, profit30 = 0;
  for (const l of lines) {
    const pid = l.product_id; if (!pid) continue;
    const s = (sales[pid] ??= { u30: 0, u7: 0, u1: 0, rev: 0, profit: 0 });
    const q = Number(l.qty) || 0, rev = Number(l.line_revenue) || 0, prof = rev - (Number(l.line_cogs) || 0);
    s.u30 += q; s.rev += rev; s.profit += prof;
    if (l.sold_at && l.sold_at >= d7) s.u7 += q;
    if (l.sold_at && l.sold_at >= d1) s.u1 += q;
    units30 += q; rev30 += rev; profit30 += prof;
  }

  // suppliers map
  const supMap: Record<string, string> = {};
  const supIds = [...new Set(products.map(p => p.primary_supplier_id).filter(Boolean))] as string[];
  if (supIds.length) for (const s of await safe<{ id: string; name: string }>(admin.from('suppliers').select('id, name').in('id', supIds))) supMap[s.id] = s.name;

  // 4) Per-product economics
  const rows = products.map(p => {
    const cost = costMap[p.id] ?? null;
    const price = priceMap[p.id] ?? null;
    const upc = p.units_per_case && p.units_per_case > 0 ? p.units_per_case : null;
    const profitPerUnit = cost != null && price != null ? r2(price - cost) : null;
    const marginPct = cost != null && price != null && cost > 0 ? Math.round(((price - cost) / cost) * 100) : null;
    const stock = p.stock_count != null ? Number(p.stock_count) : null;
    const s = sales[p.id] ?? { u30: 0, u7: 0, u1: 0, rev: 0, profit: 0 };
    return {
      id: p.id, name: p.name, supplier: p.primary_supplier_id ? (supMap[p.primary_supplier_id] ?? null) : null,
      unit_cost: cost, retail_price: price, units_per_case: upc,
      case_cost: cost != null && upc ? r2(cost * upc) : null,
      profit_per_unit: profitPerUnit,
      profit_per_case: profitPerUnit != null && upc ? r2(profitPerUnit * upc) : null,
      margin_pct: marginPct,
      stock_count: stock,
      cases_remaining: stock != null && upc ? Math.floor(stock / upc) : null,
      units_remaining: stock,
      low_threshold: p.low_stock_threshold != null ? Number(p.low_stock_threshold) : null,
      pack_size: p.pack_size,
      sold_1d: s.u1, sold_7d: s.u7, sold_30d: s.u30, revenue_30d: r2(s.rev), profit_30d: r2(s.profit),
    };
  });

  const ranked = [...rows].sort((a, b) => b.sold_30d - a.sold_30d);
  const fast = ranked.filter(r => r.sold_30d > 0).slice(0, 8);
  const slow = ranked.filter(r => r.sold_30d === 0).slice(0, 8);

  // 5) Reorder recommendations: low stock → recommend whole cases.
  const reorders = rows
    .filter(r => r.stock_count != null && (r.low_threshold != null ? r.stock_count <= r.low_threshold : r.stock_count <= (r.units_per_case ? r.units_per_case * 0.15 : 2)))
    .sort((a, b) => (a.stock_count ?? 0) - (b.stock_count ?? 0))
    .slice(0, 12)
    .map(r => ({ id: r.id, name: r.name, supplier: r.supplier, units_remaining: r.stock_count, units_per_case: r.units_per_case, recommend_cases: r.units_per_case ? 1 : null, velocity_7d: r.sold_7d }));

  // 6) Supplier price changes: current vs previous cost per product (last 60d).
  const recentCosts = await safe<{ product_id: string; cost_per_unit: number | null; effective_from: string | null; is_current: boolean | null }>(
    admin.from('product_costs').select('product_id, cost_per_unit, effective_from, is_current')
      .in('product_id', ids).gte('effective_from', daysAgoISO(60)).order('effective_from', { ascending: false }));
  const byProd: Record<string, { cost: number; at: string | null }[]> = {};
  for (const c of recentCosts) {
    if (c.cost_per_unit == null) continue;
    (byProd[c.product_id] ??= []).push({ cost: Number(c.cost_per_unit), at: c.effective_from });
  }
  const nameById: Record<string, { name: string; supplier: string | null }> = {};
  for (const r of rows) nameById[r.id] = { name: r.name, supplier: r.supplier };
  const price_changes = Object.entries(byProd)
    .filter(([, hist]) => hist.length >= 2 && hist[0].cost !== hist[1].cost)
    .map(([pid, hist]) => ({
      id: pid, name: nameById[pid]?.name ?? '(product)', supplier: nameById[pid]?.supplier ?? null,
      old_cost: r2(hist[1].cost), new_cost: r2(hist[0].cost), diff: r2(hist[0].cost - hist[1].cost),
      direction: hist[0].cost > hist[1].cost ? 'up' : 'down', changed_at: hist[0].at,
    }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 15);

  // 7) Founder alerts
  const alerts: { type: string; severity: 'warn' | 'info'; message: string }[] = [];
  for (const c of price_changes.slice(0, 6)) alerts.push({ type: 'cost_change', severity: c.direction === 'up' ? 'warn' : 'info', message: `${c.direction === 'up' ? '↑' : '↓'} ${c.name} cost ${c.direction === 'up' ? 'rose' : 'fell'} $${Math.abs(c.diff).toFixed(2)} (now $${c.new_cost.toFixed(2)})` });
  for (const r of reorders.slice(0, 5)) alerts.push({ type: 'reorder', severity: 'warn', message: `${r.name}: only ${r.units_remaining} left${r.recommend_cases ? ' — reorder 1 case' : ''}` });
  for (const r of rows.filter(r => r.margin_pct != null && r.margin_pct < 10).slice(0, 5)) alerts.push({ type: 'low_margin', severity: 'warn', message: `${r.name} margin is only ${r.margin_pct}% — review pricing` });
  for (const r of fast.slice(0, 3)) alerts.push({ type: 'fast_mover', severity: 'info', message: `${r.name} is moving fast (${r.sold_7d} sold this week) — pricing opportunity` });

  return NextResponse.json({
    ok: true,
    channel_label: 'Retail Online Market',
    summary: { products: rows.length, units_sold_30d: units30, revenue_30d: r2(rev30), profit_30d: r2(profit30) },
    movers: { fast, slow },
    price_changes,
    reorders,
    alerts,
    products: rows.sort((a, b) => a.name.localeCompare(b.name)),
  });
}
