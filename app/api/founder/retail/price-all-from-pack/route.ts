// /api/founder/retail/price-all-from-pack
//
// Bulk: set per-item cost = current cost ÷ units-per-case for every Retail Online
// Market product that has a pack count. Units = stored units_per_case, else the
// first number in Pack. Inserts a fresh per-unit cost via the immutable
// product_costs path (online price auto-recomputes proportionally — margins
// preserved) and sets unit_of_measure='each' + units_per_case.
//
// DRY-RUN by default (returns before→after for review). Applies only when
// { apply: true }. Founder-only, service-role. Never touches tax/margin math.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const unitsFromPack = (pack: string | null): number | null => {
  const m = String(pack ?? '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const r4 = (n: number) => Math.round(n * 10000) / 10000;

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
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only.' }, { status: 403 });

  let apply = false;
  try { const b = await req.json(); apply = b?.apply === true; } catch { /* dry-run */ }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: prods, error } = await admin.from('products')
    .select('id, name, pack_size, units_per_case, unit_of_measure, primary_supplier_id')
    .eq('sell_online', true).eq('status', 'active').order('name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const products = (prods ?? []) as Array<{ id: string; name: string; pack_size: string | null; units_per_case: number | null; unit_of_measure: string | null; primary_supplier_id: string | null }>;
  const ids = products.map(p => p.id);

  // Current costs (chunked)
  const costMap: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data: costs } = await admin.from('product_costs').select('product_id, cost_per_unit, effective_from').in('product_id', ids.slice(i, i + 100)).eq('is_current', true);
    for (const c of (costs ?? []) as Array<{ product_id: string; cost_per_unit: number | null }>) if (c.cost_per_unit != null && Number(c.cost_per_unit) > 0 && costMap[c.product_id] == null) costMap[c.product_id] = Number(c.cost_per_unit);
  }

  const changes: { id: string; name: string; pack: string | null; units: number; current_cost: number; new_cost: number }[] = [];
  for (const p of products) {
    const units = (p.units_per_case && p.units_per_case > 1) ? p.units_per_case : (unitsFromPack(p.pack_size) ?? 0);
    const cost = costMap[p.id];
    if (units <= 1 || cost == null) continue;          // no pack count or no cost → skip
    const newCost = r4(cost / units);
    if (Math.abs(newCost - cost) < 0.0001) continue;   // already per-unit → skip
    changes.push({ id: p.id, name: p.name, pack: p.pack_size, units, current_cost: cost, new_cost: newCost });
  }

  if (!apply) {
    return NextResponse.json({ ok: true, dry_run: true, count: changes.length, total_retail: products.length, sample: changes.slice(0, 12) });
  }

  // Apply: insert per-unit cost + set units/each. Reuses the proven cost path.
  let applied = 0; const errors: string[] = [];
  for (const c of changes) {
    const p = products.find(x => x.id === c.id)!;
    const { error: costErr } = await admin.from('product_costs').insert({
      product_id: c.id, supplier_id: p.primary_supplier_id, cost_type: 'purchase',
      cost_per_unit: c.new_cost, unit_of_measure: 'each',
      shipping_per_lb: 0, customs_duty_pct: 0, vat_levy_pct: 0, processing_fee: 0,
      effective_from: new Date().toISOString(), is_current: true, recorded_by: user.id,
    });
    if (costErr) { errors.push(`${c.name}: ${costErr.message}`); continue; }
    await admin.from('products').update({ unit_of_measure: 'each', units_per_case: c.units }).eq('id', c.id);
    applied++;
  }
  try { await admin.from('ai_writes').insert({ tool: 'retail_price_all_from_pack', caller_id: user.id, input: { count: changes.length }, result: { applied }, status: errors.length ? 'partial' : 'success', error: errors.slice(0, 3).join(' | ') || null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, applied, attempted: changes.length, errors: errors.slice(0, 5) });
}
