// /api/founder/wholesale
//
// Wholesale Online Market — lists each product as a CASE (the full case sold as
// one wholesale unit), the counterpart to the per-item Retail Online Market.
//   units per case  = stored units_per_case, else first number in Pack
//   per-item cost   = current product cost
//   case cost       = per-item cost × units per case
//   case price      = wholesale per-item price × units per case  (preferred),
//                     else case cost × (1 + default wholesale margin)
// Read-only — does NOT change the per-item local_wholesale price (so the main
// store's quantity auto-upgrade is untouched). Founder-only, service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const WS_CHANNEL = 'local_wholesale';
const DEFAULT_WS_MARGIN = 0.19; // lib/pricing.ts local_wholesale markup
const r2 = (n: number) => Math.round(n * 100) / 100;
const unitsFromPack = (pack: string | null): number | null => {
  const m = String(pack ?? '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

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
  const { data: prods, error } = await admin.from('products')
    .select('id, name, pack_size, units_per_case, primary_supplier_id, sell_wholesale, sell_online')
    .eq('status', 'active').or('sell_online.eq.true,sell_wholesale.eq.true').order('name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const products = (prods ?? []) as Array<{ id: string; name: string; pack_size: string | null; units_per_case: number | null; primary_supplier_id: string | null; sell_wholesale: boolean; sell_online: boolean }>;
  const ids = products.map(p => p.id);

  const costMap: Record<string, number> = {};
  const wsPriceMap: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const [{ data: costs }, { data: prices }] = await Promise.all([
      admin.from('product_costs').select('product_id, cost_per_unit').in('product_id', slice).eq('is_current', true),
      admin.from('product_pricing').select('product_id, manual_unit_price').in('product_id', slice).eq('channel', WS_CHANNEL).eq('is_current', true).eq('is_active', true),
    ]);
    for (const c of (costs ?? []) as Array<{ product_id: string; cost_per_unit: number | null }>) if (c.cost_per_unit != null && Number(c.cost_per_unit) > 0 && costMap[c.product_id] == null) costMap[c.product_id] = Number(c.cost_per_unit);
    for (const p of (prices ?? []) as Array<{ product_id: string; manual_unit_price: number | null }>) if (p.manual_unit_price != null) wsPriceMap[p.product_id] = Number(p.manual_unit_price);
  }

  const supIds = [...new Set(products.map(p => p.primary_supplier_id).filter(Boolean))] as string[];
  const supMap: Record<string, string> = {};
  if (supIds.length) for (const s of (await admin.from('suppliers').select('id, name').in('id', supIds)).data ?? [] as Array<{ id: string; name: string }>) supMap[s.id] = s.name;

  const rows = products.map(p => {
    const units = (p.units_per_case && p.units_per_case > 1) ? p.units_per_case : unitsFromPack(p.pack_size);
    const itemCost = costMap[p.id] ?? null;
    const wsItemPrice = wsPriceMap[p.id] ?? null;
    const caseCost = itemCost != null && units ? r2(itemCost * units) : null;
    const casePrice = (wsItemPrice != null && units) ? r2(wsItemPrice * units)
      : (caseCost != null ? r2(caseCost * (1 + DEFAULT_WS_MARGIN)) : null);
    const caseProfit = casePrice != null && caseCost != null ? r2(casePrice - caseCost) : null;
    const marginPct = casePrice != null && caseCost != null && caseCost > 0 ? Math.round(((casePrice - caseCost) / caseCost) * 100) : null;
    return {
      id: p.id, name: p.name, supplier: p.primary_supplier_id ? (supMap[p.primary_supplier_id] ?? null) : null,
      pack_size: p.pack_size, units_per_case: units, on_wholesale: !!p.sell_wholesale,
      item_cost: itemCost, case_cost: caseCost, case_price: casePrice, case_profit: caseProfit, margin_pct: marginPct,
      ws_item_price: wsItemPrice,
    };
  });

  const cases = rows.filter(r => r.units_per_case && r.units_per_case > 1);
  return NextResponse.json({
    ok: true,
    summary: {
      case_products: cases.length,
      on_wholesale: cases.filter(r => r.on_wholesale).length,
      missing_from_wholesale: cases.filter(r => !r.on_wholesale).length,
      no_case_size: rows.filter(r => !r.units_per_case || r.units_per_case <= 1).length,
    },
    products: cases,
  });
}
