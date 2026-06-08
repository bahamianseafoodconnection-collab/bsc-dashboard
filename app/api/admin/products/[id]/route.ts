// /api/admin/products/[id]
//
// Generic PATCH endpoint backing the /admin/inventory spreadsheet's
// inline edits. Per founder direction 2026-05-27 ("the very same
// excel spreadsheet... needs to be implemented in my dashboard for
// adding more items and editing").
//
// Routes one cell-blur at a time from the spreadsheet:
//   - cost_per_unit  → INSERT product_costs (cost_type='purchase') →
//                      trigger auto-recalcs per-channel pricing
//   - sell_*         → UPDATE products.sell_{nassau,andros,online,wholesale}
//   - other fields   → UPDATE products row directly
//
// Auth: founder / co_founder / manager / control_admin / basic_admin
// (excludes cashier — cashiers cannot rewrite catalog).
//
// Returns: { ok, updated_fields, new_prices? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'founder', 'co_founder', 'manager',
  'control_admin', 'basic_admin',
]);

const EDITABLE_FIELDS = new Set([
  'name', 'barcode', 'description', 'category', 'unit_of_measure', 'pack_size',
  'vat_category', 'vat_code', 'status',
  'sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale',
  'image_url', 'primary_supplier_id', 'is_bsc_processed',
  // Phase 3 — stock + featured fields (added in migration 20260527160000)
  'stock_count', 'low_stock_threshold', 'is_featured', 'featured_until',
]);

interface PatchBody {
  cost_per_unit?: unknown;
  [k: string]: unknown;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await ctx.params;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json(
      { ok: false, error: `Role "${role ?? 'none'}" cannot edit products.` },
      { status: 403 },
    );
  }

  // Body
  let body: PatchBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  if (!productId) {
    return NextResponse.json({ ok: false, error: 'product id required' }, { status: 400 });
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify product exists
  const { data: prod, error: prodErr } = await admin
    .from('products')
    .select('id, unit_of_measure, primary_supplier_id, status')
    .eq('id', productId)
    .maybeSingle<{ id: string; unit_of_measure: string | null; primary_supplier_id: string | null; status: string | null }>();
  if (prodErr || !prod) {
    return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });
  }

  const updatedFields: string[] = [];
  let newPrices: Record<string, number> | undefined;

  // ─── Cost update (special — inserts product_costs row, fires trigger) ──
  if (body.cost_per_unit !== undefined) {
    const cost = typeof body.cost_per_unit === 'number' ? body.cost_per_unit : NaN;
    if (!Number.isFinite(cost) || cost <= 0) {
      return NextResponse.json({ ok: false, error: 'cost_per_unit must be > 0' }, { status: 400 });
    }
    if (cost > 100000) {
      return NextResponse.json({ ok: false, error: 'cost_per_unit looks too large (sanity check)' }, { status: 400 });
    }
    const { error: costErr } = await admin.from('product_costs').insert({
      product_id:       prod.id,
      supplier_id:      prod.primary_supplier_id,
      cost_type:        'purchase',
      cost_per_unit:    cost,
      unit_of_measure:  prod.unit_of_measure ?? 'each',
      shipping_per_lb:  0,
      customs_duty_pct: 0,
      vat_levy_pct:     0,
      processing_fee:   0,
      effective_from:   new Date().toISOString(),
      is_current:       true,
      recorded_by:      user.id,
    });
    if (costErr) {
      return NextResponse.json({ ok: false, error: `Cost update failed: ${costErr.message}` }, { status: 500 });
    }
    updatedFields.push('cost_per_unit');

    // Read back the recalc'd prices (the recalc_channel_prices_on_purchase trigger
    // already wrote new product_pricing rows in the same transaction)
    const { data: newPriceRows } = await admin
      .from('product_pricing')
      .select('channel, manual_unit_price')
      .eq('product_id', prod.id)
      .eq('is_current', true);
    newPrices = {};
    for (const r of (newPriceRows ?? []) as Array<{ channel: string; manual_unit_price: number | null }>) {
      if (r.manual_unit_price !== null) newPrices[r.channel] = r.manual_unit_price;
    }
  }

  // ─── Regular field updates (one or more) ───────────────────────────
  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'cost_per_unit') continue;
    if (!EDITABLE_FIELDS.has(key)) continue;
    updatePayload[key] = value;
  }
  if (Object.keys(updatePayload).length > 0) {
    const { error: updErr } = await admin
      .from('products')
      .update(updatePayload)
      .eq('id', prod.id);
    if (updErr) {
      return NextResponse.json(
        { ok: false, error: `Update failed: ${updErr.message}`, updatedFields },
        { status: 500 },
      );
    }
    updatedFields.push(...Object.keys(updatePayload));
  }

  // ─── Per-channel margins (from the Edit modal margin blocks) ──────────
  // { channel_margins: { nassau_pos: 40, online_market: 30, ... } } as
  // PERCENT. Each is applied via bsc_set_channel_price, which STORES the
  // margin (so it sticks through cost receipts) and re-prices from the
  // current cost — atomic, so this can't half-fail.
  const VALID_PRICE_CHANNELS = new Set(['nassau_pos', 'andros_pos', 'online_market', 'local_wholesale']);
  if (body.channel_margins && typeof body.channel_margins === 'object') {
    for (const [ch, v] of Object.entries(body.channel_margins as Record<string, unknown>)) {
      const pct = Number(v);
      if (!VALID_PRICE_CHANNELS.has(ch) || !Number.isFinite(pct) || pct < 0) continue;
      const { data: priced, error: rpcErr } = await admin.rpc('bsc_set_channel_price', {
        p_product_id: prod.id,
        p_channel:    ch,
        p_margin:     Math.round(pct * 100) / 10000,   // 40 → 0.40
        p_user:       user.id,
      });
      if (rpcErr) {
        return NextResponse.json({ ok: false, error: `Price update failed (${ch}): ${rpcErr.message}`, updatedFields }, { status: 500 });
      }
      newPrices = { ...(newPrices ?? {}), [ch]: Number(priced) };
      updatedFields.push(`price_${ch}`);
    }
  }

  if (updatedFields.length === 0) {
    return NextResponse.json({ ok: false, error: 'No editable fields in request' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    product_id: prod.id,
    updated_fields: updatedFields,
    new_prices: newPrices,
  });
}
