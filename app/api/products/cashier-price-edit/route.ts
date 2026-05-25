// /api/products/cashier-price-edit
//
// Claff (cashier) — and any allowed POS role — sets the live POS price
// at the register. We back-compute the product's cost from her new POS
// price + the product's vat_category, then forward-compute ALL OTHER
// channel prices via lib/pricing.ts calculatePrice() so they stay in
// sync with the 5-channel sacred markups (22 / 19 / 35 / 40 / 40).
//
// Every edit is logged to cashier_price_edits for Dedrick's 4-5-day
// review window. The actual price writes follow the canonical
// immutability pattern: INSERT new product_costs row (trigger expires
// the old) + INSERT new product_pricing rows per channel.
//
// Role gate: cashier, andros_staff, manager, founder, co_founder,
// control_admin, basic_admin. The channel_set defaults to nassau_pos
// (most edits) but can be 'andros_pos' if the request comes from there.
//
// Body:
//   {
//     product_id:    string (UUID),
//     new_pos_price: number,         // what Claff is charging today
//     channel_set?:  'nassau_pos' | 'andros_pos'  (default nassau_pos)
//     reason?:       string          // optional note
//   }
//
// Returns: {
//   ok, edit_id, product_id, new_cost, channel_prices: { nassau_pos, andros_pos, online_retail/online_market, wholesale_in_store, wholesale_online }
// }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculatePrice, vatPctForCategory } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'cashier','andros_staff','manager',
  'founder','co_founder','control_admin','basic_admin',
]);

// DB channel keys ↔ pricing.ts channel keys ↔ markup pct
const CHANNELS: Array<{ db: string; pricingCh: 'nassau_pos' | 'andros_pos' | 'online_retail' | 'wholesale_in_store' | 'wholesale_online'; markup: number }> = [
  { db: 'nassau_pos',         pricingCh: 'nassau_pos',         markup: 40 },
  { db: 'andros_pos',         pricingCh: 'andros_pos',         markup: 40 },
  { db: 'online_market',      pricingCh: 'online_retail',      markup: 35 },
  { db: 'wholesale_in_store', pricingCh: 'wholesale_in_store', markup: 22 },
  { db: 'wholesale_online',   pricingCh: 'wholesale_online',   markup: 19 },
];

export async function POST(req: NextRequest) {
  const supaUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !svcKey || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Supabase server not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }

  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });

  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const callerRole = (prof as { role?: string | null } | null)?.role ?? null;
  if (!callerRole || !ALLOWED_ROLES.has(callerRole)) {
    return NextResponse.json({ ok: false, error: `Role "${callerRole ?? 'none'}" cannot edit POS prices.` }, { status: 403 });
  }

  let body: { product_id?: unknown; new_pos_price?: unknown; channel_set?: unknown; reason?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const productId   = typeof body.product_id === 'string' ? body.product_id : '';
  const newPosPrice = typeof body.new_pos_price === 'number' ? body.new_pos_price : NaN;
  const channelSet  = (body.channel_set === 'andros_pos') ? 'andros_pos' : 'nassau_pos';
  const reason      = typeof body.reason === 'string' ? body.reason.trim() : null;

  // Item 12: role-to-channel binding — register staff can only edit
  // their own store's pricing. Higher roles (manager / founder /
  // co_founder / control_admin / basic_admin) cover both stores and
  // remain unrestricted. Closes the silent cross-store edit vector
  // flagged in the 2026-05-24 assumptions sweep.
  if (callerRole === 'cashier'      && channelSet !== 'nassau_pos') {
    return NextResponse.json({ ok: false, error: 'Nassau cashier can only edit Nassau POS prices.' }, { status: 403 });
  }
  if (callerRole === 'andros_staff' && channelSet !== 'andros_pos') {
    return NextResponse.json({ ok: false, error: 'Andros staff can only edit Andros POS prices.' }, { status: 403 });
  }

  if (!productId || !Number.isFinite(newPosPrice) || newPosPrice <= 0) {
    return NextResponse.json({ ok: false, error: 'product_id + positive new_pos_price required.' }, { status: 400 });
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Load product + current cost + current POS price for the audit row.
  const { data: prodRow, error: prodErr } = await admin
    .from('products')
    .select('id, sku, vat_category')
    .eq('id', productId)
    .maybeSingle();
  if (prodErr || !prodRow) {
    return NextResponse.json({ ok: false, error: `Product not found: ${prodErr?.message ?? productId}` }, { status: 404 });
  }
  const product = prodRow as { id: string; sku: string; vat_category: string | null };
  const vatCat  = product.vat_category ?? 'uncooked_food';
  const vatPct  = vatPctForCategory(vatCat);

  // Pull current cost (most recent is_current=TRUE) for the audit row.
  const { data: curCost } = await admin
    .from('product_costs')
    .select('cost_per_unit, unit_of_measure, supplier_id')
    .eq('product_id', productId)
    .eq('is_current', true)
    .maybeSingle();
  const oldCost = (curCost as { cost_per_unit?: number | null } | null)?.cost_per_unit ?? null;

  // Pull current Nassau POS price for the audit row.
  const { data: curPrice } = await admin
    .from('product_pricing')
    .select('manual_unit_price')
    .eq('product_id', productId)
    .eq('channel', 'nassau_pos')
    .eq('is_current', true)
    .maybeSingle();
  const oldNassauPrice = (curPrice as { manual_unit_price?: number | null } | null)?.manual_unit_price ?? null;

  // 2. Back-compute cost from the new POS price.
  //    new_pos_price = cost × (1 + markup) × (1 + vat)
  //    → cost = new_pos_price / (1 + markup) / (1 + vat)
  //    Use the channel the cashier is editing on (Nassau is 40%; Andros is also 40%).
  const sourceMarkupPct = channelSet === 'andros_pos' ? 40 : 40;
  const newCost = newPosPrice / (1 + sourceMarkupPct / 100) / (1 + vatPct / 100);
  const newCostRounded = Math.round(newCost * 10000) / 10000;

  // 3. Forward-compute every channel's price using calculatePrice() with the derived cost.
  const channelPrices: Record<string, number> = {};
  for (const ch of CHANNELS) {
    const r = calculatePrice({
      cost:     newCostRounded,
      channel:  ch.pricingCh,
      quantity: 1,
      unit:     'each',
      vatPct,
    });
    // For the channel Claff explicitly set, keep her exact figure (no rounding drift).
    if (ch.db === channelSet) {
      channelPrices[ch.db] = Math.round(newPosPrice * 100) / 100;
    } else {
      channelPrices[ch.db] = Math.round(r.finalPrice * 100) / 100;
    }
  }

  const nowIso = new Date().toISOString();

  // 4. INSERT a new product_costs row — trigger flips the old one to is_current=FALSE.
  //    Using cost_type='opening_balance' since 'cashier_set' isn't seeded in the enum
  //    (per memory rule — only opening_balance is safe).
  {
    const supplierId = (curCost as { supplier_id?: string | null } | null)?.supplier_id ?? null;
    const unit       = (curCost as { unit_of_measure?: string | null } | null)?.unit_of_measure ?? 'each';
    const { error } = await admin.from('product_costs').insert({
      product_id:      productId,
      supplier_id:     supplierId,
      cost_type:       'opening_balance',
      cost_per_unit:   newCostRounded,
      unit_of_measure: unit,
      shipping_per_lb: 0,
      customs_duty_pct: 0,
      vat_levy_pct:    0,
      processing_fee:  0,
      effective_from:  nowIso,
      is_current:      true,
      recorded_by:     user.id,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: `Cost insert failed: ${error.message}` }, { status: 400 });
    }
  }

  // 5. INSERT new product_pricing rows for every channel (5 rows total).
  //    The is_current/effective_from supersession is handled by the
  //    schema's pattern: latest is_current=TRUE wins. Older rows stay
  //    for audit but aren't picked up by /market, /pos, /checkout.
  //    First, flip all existing is_current rows to false for this product.
  await admin
    .from('product_pricing')
    .update({ is_current: false })
    .eq('product_id', productId)
    .eq('is_current', true);

  const pricingRows = CHANNELS.map(ch => ({
    product_id:         productId,
    channel:            ch.db,
    pricing_mode:       'manual_override',
    margin_multiplier:  1.0,
    vat_multiplier:     1.0,
    manual_unit_price:  channelPrices[ch.db],
    shipping_per_lb:    0,
    customs_duty_pct:   0,
    vat_levy_pct:       0,
    per_transaction_fee: 0,
    service_fee_pct:    0,
    effective_from:     nowIso,
    is_current:         true,
    is_active:          true,
    recorded_by:        user.id,
  }));
  const { error: prErr } = await admin.from('product_pricing').insert(pricingRows);
  if (prErr) {
    return NextResponse.json({ ok: false, error: `Pricing insert failed: ${prErr.message}` }, { status: 400 });
  }

  // 6. Audit log.
  const { data: editRow, error: auditErr } = await admin
    .from('cashier_price_edits')
    .insert({
      product_id:        productId,
      product_sku:       product.sku,
      cashier_user_id:   user.id,
      cashier_role:      callerRole,
      channel_set:       channelSet,
      vat_category:      vatCat,
      old_cost_per_unit: oldCost,
      new_cost_per_unit: newCostRounded,
      old_nassau_price:  oldNassauPrice,
      new_nassau_price:  channelPrices['nassau_pos'],
      channel_prices:    channelPrices,
      reason,
    })
    .select('id')
    .single();
  // Audit failure shouldn't block the edit — log it but continue.
  if (auditErr) console.warn('cashier_price_edits insert failed (non-fatal):', auditErr.message);

  return NextResponse.json({
    ok:             true,
    edit_id:        (editRow as { id?: string } | null)?.id ?? null,
    product_id:     productId,
    sku:            product.sku,
    new_cost:       newCostRounded,
    vat_category:   vatCat,
    vat_pct:        vatPct,
    channel_prices: channelPrices,
  });
}
