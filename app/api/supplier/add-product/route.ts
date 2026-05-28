// /api/supplier/add-product
//
// Add a new product under a specific supplier from the /supplier
// dashboard's Add Product modal (Phase 1B, 2026-05-26).
//
// Auth: founder + co_founder only. Same gate that /supplier client-side
// enforces via canLock(role) — this server check is the authoritative
// version. Service-role admin client does the actual INSERTs so RLS on
// products / product_costs / product_pricing doesn't block legitimate
// admin writes.
//
// Body (all required fields named first):
//   {
//     supplier_id:        UUID — becomes primary_supplier_id
//     sku:                string (must be unique on products.sku)
//     name:               string
//     category:           string (matches product_category enum value)
//     unit_of_measure:    string ('lb' | 'each' | 'case' | 'bag' | 'portion' | ...)
//     pack_size?:         string
//     cost_per_unit?:     number — if present, INSERT a product_costs row
//     online_sell_price?: number — if present + online channel selected,
//                                  INSERT product_pricing row (channel='online_market')
//     channels: { nassau: bool, andros: bool, online: bool, wholesale: bool }
//                                — drives sell_nassau / sell_andros /
//                                  sell_online / sell_wholesale on products
//   }
// Returns: { ok, product_id, sku } | { ok: false, error }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);

interface AddProductBody {
  supplier_id?:       unknown;
  sku?:               unknown;
  name?:              unknown;
  category?:          unknown;
  unit_of_measure?:   unknown;
  pack_size?:         unknown;
  cost_per_unit?:     unknown;
  online_sell_price?: unknown;
  channel_prices?:    unknown;
  channels?:          unknown;
  image_url?:         unknown;
  stock_count?:       unknown;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
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
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot add products.` }, { status: 403 });
  }

  let body: AddProductBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const supplierId    = typeof body.supplier_id === 'string' ? body.supplier_id : '';
  const sku           = typeof body.sku === 'string' ? body.sku.trim() : '';
  const name          = typeof body.name === 'string' ? body.name.trim() : '';
  const category      = typeof body.category === 'string' ? body.category.trim() : '';
  const unitOfMeasure = typeof body.unit_of_measure === 'string' ? body.unit_of_measure.trim() : '';
  const packSize      = typeof body.pack_size === 'string' && body.pack_size.trim() ? body.pack_size.trim() : null;
  const costPerUnit   = typeof body.cost_per_unit === 'number' && Number.isFinite(body.cost_per_unit) && body.cost_per_unit >= 0
                          ? body.cost_per_unit : null;
  const onlinePrice   = typeof body.online_sell_price === 'number' && Number.isFinite(body.online_sell_price) && body.online_sell_price >= 0
                          ? body.online_sell_price : null;

  // Explicit per-channel selling prices (founder set a margin per channel
  // in the Add-Product modal). Keys are pricing_channel enum values.
  // What the founder previewed = exactly what we store. Wins over the
  // global-margin computation below.
  const VALID_PRICE_CHANNELS = new Set(['nassau_pos', 'andros_pos', 'online_market', 'local_wholesale']);
  const channelPricesRaw = (body.channel_prices && typeof body.channel_prices === 'object')
    ? body.channel_prices as Record<string, unknown> : {};
  const channelPrices = new Map<string, number>();
  for (const [ch, v] of Object.entries(channelPricesRaw)) {
    const n = Number(v);
    if (VALID_PRICE_CHANNELS.has(ch) && Number.isFinite(n) && n >= 0) channelPrices.set(ch, Math.round(n * 100) / 100);
  }

  const channelsRaw = (body.channels && typeof body.channels === 'object') ? body.channels as Record<string, unknown> : {};
  const sellNassau    = channelsRaw.nassau    === true;
  const sellAndros    = channelsRaw.andros    === true;
  const sellOnline    = channelsRaw.online    === true;
  const sellWholesale = channelsRaw.wholesale === true;

  // Photo uploaded client-side to site-images bucket → products.image_url
  // so /market thumbnails render. Optional — products can be added without
  // a photo when dumping a price list, and photo-passed later.
  // (products has no photo_urls column, so only image_url is stored.)
  const imageUrl  = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;

  // Opening quantity in stock (optional). Column added in migration
  // 20260527160000; the inventory grid reads/writes it.
  const stockCount = typeof body.stock_count === 'number' && Number.isFinite(body.stock_count) && body.stock_count >= 0
                       ? Math.round(body.stock_count) : null;

  if (!supplierId || !sku || !name || !category || !unitOfMeasure) {
    return NextResponse.json(
      { ok: false, error: 'supplier_id + sku + name + category + unit_of_measure are all required.' },
      { status: 400 },
    );
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Verify supplier exists (so we don't INSERT an orphaned FK).
  const { data: supplier, error: supErr } = await admin
    .from('suppliers')
    .select('id, code, name')
    .eq('id', supplierId)
    .maybeSingle();
  if (supErr || !supplier) {
    return NextResponse.json({ ok: false, error: `Supplier ${supplierId.slice(0, 8)} not found` }, { status: 404 });
  }

  // 2. INSERT product. SKU is unique — duplicate returns 23505.
  const productRow: Record<string, unknown> = {
    sku,
    name,
    category,
    unit_of_measure:     unitOfMeasure,
    primary_supplier_id: supplierId,
    is_bsc_processed:    false,
    status:              'active',
    sell_nassau:         sellNassau,
    sell_andros:         sellAndros,
    sell_online:         sellOnline,
    sell_wholesale:      sellWholesale,
    created_by:          user.id,
  };
  if (packSize)    productRow.pack_size  = packSize;
  if (imageUrl)    productRow.image_url  = imageUrl;
  if (stockCount !== null) productRow.stock_count = stockCount;

  const { data: inserted, error: insertErr } = await admin
    .from('products')
    .insert(productRow)
    .select('id, sku')
    .single();
  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json(
        { ok: false, error: `SKU "${sku}" already exists. Pick a different SKU.` },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: `Product insert failed: ${insertErr.message}` }, { status: 400 });
  }

  const productId = (inserted as { id: string }).id;
  const nowIso = new Date().toISOString();

  // 3. INSERT initial product_costs row when cost provided. Uses the
  //    immutability-friendly pattern (INSERT new is_current=true; if the
  //    costs_expire_previous trigger exists it will flip any prior current
  //    row — there shouldn't be one for a brand-new product, but the
  //    pattern is consistent with /api/products/cashier-price-edit and
  //    the documented memory rule). cost_type='opening_balance' is the
  //    only safe enum value per project_product_costs_enum memory.
  if (costPerUnit !== null) {
    const { error: costErr } = await admin.from('product_costs').insert({
      product_id:       productId,
      supplier_id:      supplierId,
      cost_type:        'opening_balance',
      cost_per_unit:    costPerUnit,
      unit_of_measure:  unitOfMeasure,
      shipping_per_lb:  0,
      customs_duty_pct: 0,
      vat_levy_pct:     0,
      processing_fee:   0,
      effective_from:   nowIso,
      is_current:       true,
      recorded_by:      user.id,
    });
    // Non-fatal — product is added; cost can be set later via edit modal.
    if (costErr) console.warn('add-product cost insert failed (non-fatal):', costErr.message);
  }

  // 4. Price the product on EVERY enabled channel from the live channel
  //    margins (founder direction 2026-05-28: "all margin change to every
  //    channel"). price = cost × (1 + channel_markups.margin_pct). The
  //    optional online_sell_price is a manual override for online only;
  //    if omitted, online is computed from its margin like the rest.
  //    Falls back to online-only manual price when no cost is given.
  const channelByFlag: Array<{ on: boolean; channel: string }> = [
    { on: sellNassau,    channel: 'nassau_pos' },
    { on: sellAndros,    channel: 'andros_pos' },
    { on: sellOnline,    channel: 'online_market' },
    { on: sellWholesale, channel: 'local_wholesale' },
  ];
  const enabledChannels = channelByFlag.filter((c) => c.on).map((c) => c.channel);

  // Live margins for the enabled channels
  const marginByChannel = new Map<string, number>();
  if (costPerUnit !== null && enabledChannels.length > 0) {
    const { data: mk } = await admin
      .from('channel_markups')
      .select('channel, margin_pct')
      .in('channel', enabledChannels);
    for (const m of (mk ?? []) as Array<{ channel: string; margin_pct: number }>) {
      marginByChannel.set(m.channel, Number(m.margin_pct));
    }
  }

  const priceRows: Record<string, unknown>[] = [];
  const basePriceRow = {
    pricing_mode:        'manual_override',
    margin_multiplier:   1.0,
    vat_multiplier:      1.0,
    shipping_per_lb:     0,
    customs_duty_pct:    0,
    vat_levy_pct:        0,
    per_transaction_fee: 0,
    service_fee_pct:     0,
    effective_from:      nowIso,
    is_current:          true,
    is_active:           true,
    recorded_by:         user.id,
  };

  if (costPerUnit !== null) {
    for (const channel of enabledChannels) {
      // Priority: explicit per-channel price (founder's margin block) →
      // online manual override → global channel margin.
      let price: number | null = null;
      if (channelPrices.has(channel)) {
        price = channelPrices.get(channel)!;
      } else if (channel === 'online_market' && onlinePrice !== null) {
        price = onlinePrice;
      } else if (marginByChannel.has(channel)) {
        price = Math.round(costPerUnit * (1 + marginByChannel.get(channel)!) * 100) / 100;
      }
      if (price !== null) {
        // Store the margin (price ÷ cost) so it sticks through cost receipts.
        const mult = costPerUnit > 0 ? Math.round((price / costPerUnit) * 1_000_000) / 1_000_000 : 1.0;
        priceRows.push({ ...basePriceRow, product_id: productId, channel, manual_unit_price: price, margin_multiplier: mult });
      }
    }
  } else if (channelPrices.size > 0) {
    // No cost, but founder typed explicit prices → honor them.
    for (const channel of enabledChannels) {
      if (channelPrices.has(channel)) {
        priceRows.push({ ...basePriceRow, product_id: productId, channel, manual_unit_price: channelPrices.get(channel)! });
      }
    }
  } else if (onlinePrice !== null && sellOnline) {
    // No cost to derive margins from → still honor a manual online price.
    priceRows.push({ ...basePriceRow, product_id: productId, channel: 'online_market', manual_unit_price: onlinePrice });
  }

  if (priceRows.length > 0) {
    const { error: priceErr } = await admin.from('product_pricing').insert(priceRows);
    if (priceErr) console.warn('add-product pricing insert failed (non-fatal):', priceErr.message);
  }

  // 5. Audit row → ai_writes (Founder AI daily briefing picks this up).
  try {
    await admin.from('ai_writes').insert({
      tool:      'supplier_add_product',
      caller_id: user.id,
      input:     {
        supplier_id: supplierId, sku, name, category,
        unit_of_measure: unitOfMeasure, pack_size: packSize,
        cost_per_unit: costPerUnit, online_sell_price: onlinePrice,
        channels: { nassau: sellNassau, andros: sellAndros, online: sellOnline, wholesale: sellWholesale },
      },
      result:    { product_id: productId, sku, role },
      status:    'success',
      error:     null,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({
    ok:         true,
    product_id: productId,
    sku,
  });
}
