// /api/founder/slow-movers?days=30&slow_under=5
//
// Monthly slow-moving products report. For every ACTIVE sellable product:
// units sold + revenue over the window (from order_cogs_lines), last-sold date,
// and a velocity flag — STALLED (0 sold), SLOW (< slow_under), or OK. Includes
// products with ZERO sales (left-joined), so the founder sees what's dead, not
// just what's slow. Read-only. Service-role (orders/COGS are RLS-locked).
//
// Auth: founder/co_founder/control_admin/basic_admin/manager.

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

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 30) || 30, 1), 365);
  const slowUnder = Math.max(Number(req.nextUrl.searchParams.get('slow_under') ?? 5) || 5, 1);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1) Active sellable products + supplier name.
  const { data: prods, error: pErr } = await admin
    .from('products')
    .select('id, name, sku, category, primary_supplier_id, created_at')
    .eq('status', 'active')
    .order('name');
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  type P = { id: string; name: string; sku: string | null; category: string | null; primary_supplier_id: string | null; created_at: string };
  const products = (prods ?? []) as P[];

  const supplierIds = Array.from(new Set(products.map((p) => p.primary_supplier_id).filter(Boolean) as string[]));
  const supName = new Map<string, string>();
  if (supplierIds.length) {
    const { data: sups } = await admin.from('suppliers').select('id, name').in('id', supplierIds);
    for (const s of (sups ?? []) as { id: string; name: string }[]) supName.set(s.id, s.name);
  }

  // 2) Sales in the window from the COGS ledger.
  const { data: cogs } = await admin
    .from('order_cogs_lines')
    .select('product_id, qty, line_revenue, sold_at')
    .gte('sold_at', cutoff);
  const sold = new Map<string, { units: number; revenue: number; last: string }>();
  for (const c of (cogs ?? []) as { product_id: string | null; qty: number | null; line_revenue: number | null; sold_at: string }[]) {
    if (!c.product_id) continue;
    const s = sold.get(c.product_id) ?? { units: 0, revenue: 0, last: '' };
    s.units += Number(c.qty ?? 0);
    s.revenue += Number(c.line_revenue ?? 0);
    if (!s.last || c.sold_at > s.last) s.last = c.sold_at;
    sold.set(c.product_id, s);
  }

  // 3) Merge + flag. Sorted slowest-first (stalled, then fewest units).
  const rows = products.map((p) => {
    const s = sold.get(p.id);
    const units = s?.units ?? 0;
    const flag = units === 0 ? 'stalled' : units < slowUnder ? 'slow' : 'ok';
    return {
      product_id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      supplier_name: p.primary_supplier_id ? (supName.get(p.primary_supplier_id) ?? 'Unassigned') : 'Unassigned',
      units_sold: Number(units.toFixed(2)),
      revenue: Number((s?.revenue ?? 0).toFixed(2)),
      last_sold: s?.last || null,
      velocity: flag,
    };
  }).sort((a, b) => a.units_sold - b.units_sold || b.revenue - a.revenue);

  return NextResponse.json({
    ok: true,
    window_days: days,
    slow_under: slowUnder,
    counts: {
      total: rows.length,
      stalled: rows.filter((r) => r.velocity === 'stalled').length,
      slow: rows.filter((r) => r.velocity === 'slow').length,
    },
    rows,
  });
}
