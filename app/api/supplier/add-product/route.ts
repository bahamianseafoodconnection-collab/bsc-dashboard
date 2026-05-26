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
  channels?:          unknown;
  image_url?:         unknown;
  photo_urls?:        unknown;
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

  const channelsRaw = (body.channels && typeof body.channels === 'object') ? body.channels as Record<string, unknown> : {};
  const sellNassau    = channelsRaw.nassau    === true;
  const sellAndros    = channelsRaw.andros    === true;
  const sellOnline    = channelsRaw.online    === true;
  const sellWholesale = channelsRaw.wholesale === true;

  // Photos uploaded client-side to site-images bucket. Primary photo
  // → products.image_url so /market thumbnails render. Full set →
  // products.photo_urls (text[]). Both optional — products can be
  // added without photos when a founder is dumping a price list and
  // will photo-pass later.
  const imageUrl  = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;
  const photoUrls = Array.isArray(body.photo_urls)
    ? (body.photo_urls as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];

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
  if (photoUrls.length > 0) productRow.photo_urls = photoUrls;

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

  // 4. INSERT product_pricing row for online when both the online channel
  //    is selected AND a price was provided. Other channels can be priced
  //    later via cashier-price-edit or the Edit Product modal.
  if (onlinePrice !== null && sellOnline) {
    const { error: priceErr } = await admin.from('product_pricing').insert({
      product_id:          productId,
      channel:             'online_market',
      pricing_mode:        'manual_override',
      manual_unit_price:   onlinePrice,
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
    });
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
