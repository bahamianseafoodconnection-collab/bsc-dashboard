// /api/founder/retail/receive-cases
//
// Retail Online Market Phase 2 — receive supplier CASES into retail stock.
//
// Founder/supplier-handler enters case_cost + number of cases. The route:
//   1. derives unit_cost = case_cost / units_per_case,
//   2. records it via the EXISTING immutable product_costs system (cost_type=
//      'purchase') — the recalc trigger re-prices every channel automatically,
//   3. bumps products.stock_count by cases × units_per_case,
//   4. logs a traceable row in case_receipts.
//
// Changes NO pricing math/margins and does NOT touch the sale path. Service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'manager', 'supplier_handler']);

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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot receive stock.` }, { status: 403 });

  let b: { product_id?: unknown; cases?: unknown; case_cost?: unknown; units_per_case?: unknown; notes?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const productId = typeof b.product_id === 'string' ? b.product_id : '';
  const cases = Math.floor(Number(b.cases));
  const caseCost = Number(b.case_cost);
  const upcOverride = b.units_per_case != null ? Math.floor(Number(b.units_per_case)) : null;
  if (!productId) return NextResponse.json({ ok: false, error: 'product_id required' }, { status: 400 });
  if (!Number.isFinite(cases) || cases <= 0) return NextResponse.json({ ok: false, error: 'cases must be a positive whole number' }, { status: 400 });
  if (!Number.isFinite(caseCost) || caseCost <= 0) return NextResponse.json({ ok: false, error: 'case_cost must be greater than 0' }, { status: 400 });
  if (caseCost > 1_000_000) return NextResponse.json({ ok: false, error: 'case_cost looks too large (sanity check)' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: prod, error: prodErr } = await admin
    .from('products')
    .select('id, name, status, unit_of_measure, units_per_case, stock_count, primary_supplier_id')
    .eq('id', productId)
    .maybeSingle<{ id: string; name: string; status: string | null; unit_of_measure: string | null; units_per_case: number | null; stock_count: number | null; primary_supplier_id: string | null }>();
  if (prodErr || !prod) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });
  if ((prod.status ?? '').toLowerCase() !== 'active') return NextResponse.json({ ok: false, error: `Product status is "${prod.status}" — activate it first.` }, { status: 409 });

  const upc = (upcOverride && upcOverride > 0) ? upcOverride : (prod.units_per_case && prod.units_per_case > 0 ? prod.units_per_case : 0);
  if (upc <= 0) return NextResponse.json({ ok: false, error: 'This product has no units-per-case set. Provide units_per_case (how many sellable units are in one case).' }, { status: 400 });

  const unitCost = Math.round((caseCost / upc) * 10000) / 10000;
  const unitsAdded = cases * upc;
  const supplierId = prod.primary_supplier_id;

  // 1) Record the derived unit cost through the existing immutable cost system.
  const { data: costRow, error: costErr } = await admin
    .from('product_costs')
    .insert({
      product_id: prod.id, supplier_id: supplierId, cost_type: 'purchase',
      cost_per_unit: unitCost, unit_of_measure: prod.unit_of_measure ?? 'each',
      shipping_per_lb: 0, customs_duty_pct: 0, vat_levy_pct: 0, processing_fee: 0,
      effective_from: new Date().toISOString(), is_current: true, recorded_by: user.id,
    })
    .select('id')
    .single();
  if (costErr || !costRow) return NextResponse.json({ ok: false, error: `Cost insert failed: ${costErr?.message ?? 'unknown'}` }, { status: 500 });
  const costRowId = (costRow as { id: string }).id;

  // 2) Bump retail stock (and backfill units_per_case if it was missing). Receiving
  //    a case to sell retail means selling INDIVIDUAL UNITS — set unit_of_measure
  //    'each' so the Retail Online Market sells per item (cost is already the
  //    per-unit cost, so the auto-recomputed online price is per item too).
  const newStock = (Number(prod.stock_count) || 0) + unitsAdded;
  const prodUpdate: Record<string, unknown> = { stock_count: newStock, unit_of_measure: 'each' };
  if ((!prod.units_per_case || prod.units_per_case <= 0) && upcOverride && upcOverride > 0) prodUpdate.units_per_case = upcOverride;
  const { error: stockErr } = await admin.from('products').update(prodUpdate).eq('id', prod.id);
  if (stockErr) return NextResponse.json({ ok: false, error: `Stock update failed: ${stockErr.message}` }, { status: 500 });

  // 3) Traceable receipt
  const { error: recErr } = await admin.from('case_receipts').insert({
    product_id: prod.id, supplier_id: supplierId, cases_received: cases, units_per_case: upc,
    case_cost: Math.round(caseCost * 100) / 100, unit_cost: unitCost, units_added: unitsAdded,
    cost_row_id: costRowId, received_by: user.id,
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 500) : null,
  });
  if (recErr) {
    // Cost + stock already applied; surface a soft warning (receipt log only).
    return NextResponse.json({ ok: true, warning: `Stock + cost recorded, but receipt log failed: ${recErr.message}. Run the case_receipts SQL.`, unit_cost: unitCost, units_added: unitsAdded, new_stock: newStock });
  }

  // Read back recomputed prices for confirmation.
  const { data: prices } = await admin.from('product_pricing').select('channel, manual_unit_price').eq('product_id', prod.id).eq('is_current', true);
  const priceByChannel: Record<string, number> = {};
  for (const p of (prices ?? []) as Array<{ channel: string; manual_unit_price: number | null }>) if (p.manual_unit_price != null) priceByChannel[p.channel] = p.manual_unit_price;

  return NextResponse.json({
    ok: true, product: prod.name, cases, units_per_case: upc,
    case_cost: Math.round(caseCost * 100) / 100, unit_cost: unitCost, units_added: unitsAdded,
    new_stock: newStock, online_price: priceByChannel[CHANNEL_ONLINE] ?? null,
  });
}

const CHANNEL_ONLINE = 'online_market';
