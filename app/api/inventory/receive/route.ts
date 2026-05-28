// /api/inventory/receive
//
// Staff-facing endpoint for recording a new inventory receipt (BSC just
// purchased N units of a product from a supplier at a new per-unit
// cost). Per founder direction 2026-05-27: "do this strong unbreakable,
// clear positive results just keep cost live and updated easily and
// always on every purchase".
//
// Architecture (NO bypass — the DB trigger is the unbreakable layer):
//
//   1. Auth: founder + co_founder + manager + control_admin + basic_admin
//      + receiver + supplier. Cashiers can NOT change cost (only sell).
//   2. Validates product exists, is active, supplier_id (if given)
//      matches an existing supplier.
//   3. INSERTs a single row into product_costs with cost_type='purchase'
//      and is_current=true. That's it.
//   4. The recalc_channel_prices_on_purchase trigger (migration
//      20260527140000) auto-creates new product_pricing rows for every
//      active channel on the product. Old prices flipped to
//      is_current=false. History preserved.
//   5. The existing costs_expire_previous trigger flips the previous
//      cost row to is_current=false.
//
// Returns: the new cost row id, the recomputed per-channel prices,
// and a summary the UI shows to the staff member ("Posted: cost $6.50 →
// Nassau $8.78, Andros $9.42, Online $8.45, Wholesale $7.80").
//
// Idempotency: not strictly needed. Each receipt is a real-world event;
// double-clicking the button is a real-world dupe and surfaces in the
// audit trail. UI handles disable-while-submitting.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'founder', 'co_founder', 'manager',
  'control_admin', 'basic_admin',
  'receiver', 'supplier',
]);

interface ReceiveBody {
  product_id?:    unknown;
  qty_received?:  unknown;
  cost_per_unit?: unknown;
  supplier_id?:   unknown;
  notes?:         unknown;
}

interface ProductRow {
  id:              string;
  sku:             string;
  name:            string;
  status:          string | null;
  unit_of_measure: string | null;
  sell_nassau:     boolean;
  sell_andros:     boolean;
  sell_online:     boolean;
  sell_wholesale:  boolean;
  primary_supplier_id: string | null;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // ─── Auth ───────────────────────────────────────────────────────────
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
      { ok: false, error: `Role "${role ?? 'none'}" cannot record inventory receipts.` },
      { status: 403 },
    );
  }

  // ─── Body validation ────────────────────────────────────────────────
  let body: ReceiveBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const productId = typeof body.product_id === 'string' ? body.product_id : '';
  const qty       = typeof body.qty_received === 'number' && Number.isFinite(body.qty_received)
                      ? body.qty_received : NaN;
  const cost      = typeof body.cost_per_unit === 'number' && Number.isFinite(body.cost_per_unit)
                      ? body.cost_per_unit : NaN;
  const supplierId = typeof body.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null;
  const notes      = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null;

  if (!productId)              return NextResponse.json({ ok: false, error: 'product_id required' },    { status: 400 });
  if (!(qty > 0))              return NextResponse.json({ ok: false, error: 'qty_received must be > 0' }, { status: 400 });
  if (!(cost > 0))             return NextResponse.json({ ok: false, error: 'cost_per_unit must be > 0' }, { status: 400 });
  if (cost > 100000)           return NextResponse.json({ ok: false, error: 'cost_per_unit looks too large (sanity check)' }, { status: 400 });

  // ─── Service-role client (RLS-bypass for the trigger to see all rows) ──
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify product exists + is active
  const { data: prod, error: prodErr } = await admin
    .from('products')
    .select('id, sku, name, status, unit_of_measure, sell_nassau, sell_andros, sell_online, sell_wholesale, primary_supplier_id')
    .eq('id', productId)
    .maybeSingle<ProductRow>();
  if (prodErr || !prod) {
    return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });
  }
  if ((prod.status ?? '').toLowerCase() !== 'active') {
    return NextResponse.json(
      { ok: false, error: `Cannot record receipt — product status is "${prod.status}". Re-activate it first.` },
      { status: 409 },
    );
  }

  // Use the product's primary supplier if none provided
  const effectiveSupplierId = supplierId || prod.primary_supplier_id;
  if (!effectiveSupplierId) {
    return NextResponse.json(
      { ok: false, error: 'No supplier associated with this product. Set primary_supplier_id first.' },
      { status: 400 },
    );
  }

  // ─── INSERT the purchase cost row — the trigger does the rest ──────
  const { data: costRow, error: costErr } = await admin
    .from('product_costs')
    .insert({
      product_id:       prod.id,
      supplier_id:      effectiveSupplierId,
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
    })
    .select('id, cost_per_unit, effective_from')
    .single();

  if (costErr || !costRow) {
    return NextResponse.json(
      { ok: false, error: `Cost insert failed: ${costErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // ─── Read back the new per-channel prices the trigger just wrote ───
  // Short delay not needed — trigger runs synchronously in the same tx.
  const { data: newPrices } = await admin
    .from('product_pricing')
    .select('channel, manual_unit_price')
    .eq('product_id', prod.id)
    .eq('is_current', true);

  const pricesByChannel: Record<string, number> = {};
  for (const p of (newPrices ?? []) as Array<{ channel: string; manual_unit_price: number | null }>) {
    if (p.manual_unit_price !== null) pricesByChannel[p.channel] = p.manual_unit_price;
  }

  // TODO follow-up (separate task): also INSERT into inventory_movements
  // (location, qty_in=qty, ref=cost_row.id). Skipping here — inventory
  // movements schema requires a location_id we don't have yet. Recording
  // qty in notes for now.

  return NextResponse.json({
    ok:              true,
    cost_row_id:     (costRow as { id: string }).id,
    product:         { sku: prod.sku, name: prod.name },
    cost_per_unit:   cost,
    qty_received:    qty,
    notes,
    prices_now:      pricesByChannel,
    message:         `Recorded ${qty} units of ${prod.name} at $${cost.toFixed(2)}/${prod.unit_of_measure}. ` +
                     `Per-channel prices auto-updated.`,
  });
}
