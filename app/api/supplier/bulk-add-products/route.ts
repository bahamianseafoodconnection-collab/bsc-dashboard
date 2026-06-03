// /api/supplier/bulk-add-products
//
// Bulk add products under a single supplier from the /supplier
// dashboard's CSV upload modal (Phase 2, 2026-05-26).
//
// Sister endpoint to /api/supplier/add-product — same auth + validation
// rules per row, but loops over an array of rows and collects per-row
// failures instead of aborting the whole batch. The client uploads after
// previewing the parsed CSV; this endpoint is the durable write step.
//
// Auth: founder + co_founder only (server-authoritative).
//
// Body:
//   {
//     supplier_id: UUID,
//     rows: Array<{
//       sku, name, category, unit_of_measure: string;
//       pack_size?: string;
//       cost_per_unit?:     number;
//       online_sell_price?: number;
//       channels: { nassau, andros, online, wholesale: boolean };
//     }>
//   }
//
// Response:
//   {
//     ok: true,
//     inserted: number,
//     failed: Array<{ row_index, sku, error }>,
//     inserted_products: Array<{ row_index, product_id, sku }>
//   }
//
// Max batch size: 500 rows per request (defense against accidental
// 100k-row pastes that would block the API process).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);
const MAX_ROWS = 500;

interface InRow {
  sku?:               unknown;
  name?:              unknown;
  category?:          unknown;
  unit_of_measure?:   unknown;
  pack_size?:         unknown;
  cost_per_unit?:     unknown;
  online_sell_price?: unknown;
  image_url?:         unknown;
  channels?:          unknown;
}

interface BulkBody {
  supplier_id?: unknown;
  rows?:        unknown;
}

interface NormalizedRow {
  sku:            string;
  name:           string;
  category:       string;
  unit_of_measure: string;
  pack_size:      string | null;
  cost_per_unit:  number | null;
  online_price:   number | null;
  image_url:      string | null;
  sell_nassau:    boolean;
  sell_andros:    boolean;
  sell_online:    boolean;
  sell_wholesale: boolean;
}

function normalizeRow(r: InRow): NormalizedRow | { error: string } {
  const sku           = typeof r.sku === 'string' ? r.sku.trim() : '';
  const name          = typeof r.name === 'string' ? r.name.trim() : '';
  const category      = typeof r.category === 'string' ? r.category.trim() : '';
  const unitOfMeasure = typeof r.unit_of_measure === 'string' ? r.unit_of_measure.trim() : '';
  const packSize      = typeof r.pack_size === 'string' && r.pack_size.trim() ? r.pack_size.trim() : null;
  const costPerUnit   = typeof r.cost_per_unit === 'number' && Number.isFinite(r.cost_per_unit) && r.cost_per_unit >= 0
                          ? r.cost_per_unit : null;
  const onlinePrice   = typeof r.online_sell_price === 'number' && Number.isFinite(r.online_sell_price) && r.online_sell_price >= 0
                          ? r.online_sell_price : null;
  const ch            = (r.channels && typeof r.channels === 'object') ? r.channels as Record<string, unknown> : {};

  if (!sku)           return { error: 'sku is required' };
  if (!name)          return { error: 'name is required' };
  if (!category)      return { error: 'category is required' };
  if (!unitOfMeasure) return { error: 'unit_of_measure is required' };

  const imageUrl = typeof r.image_url === 'string' && r.image_url.trim() ? r.image_url.trim() : null;
  return {
    sku, name, category,
    unit_of_measure: unitOfMeasure,
    pack_size:       packSize,
    cost_per_unit:   costPerUnit,
    online_price:    onlinePrice,
    image_url:       imageUrl,
    sell_nassau:     ch.nassau    === true,
    sell_andros:     ch.andros    === true,
    sell_online:     ch.online    === true,
    sell_wholesale:  ch.wholesale === true,
  };
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
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot add products.` }, { status: 403 });
  }

  let body: BulkBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const supplierId = typeof body.supplier_id === 'string' ? body.supplier_id : '';
  const rawRows    = Array.isArray(body.rows) ? body.rows : null;
  if (!supplierId)                  return NextResponse.json({ ok: false, error: 'supplier_id is required' },  { status: 400 });
  if (!rawRows || rawRows.length === 0) return NextResponse.json({ ok: false, error: 'rows array is required and must be non-empty' }, { status: 400 });
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Batch too large: ${rawRows.length} rows (max ${MAX_ROWS} per request). Split your file.` },
      { status: 400 },
    );
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Verify supplier exists.
  const { data: supplier, error: supErr } = await admin
    .from('suppliers')
    .select('id, code, name')
    .eq('id', supplierId)
    .maybeSingle();
  if (supErr || !supplier) {
    return NextResponse.json({ ok: false, error: `Supplier ${supplierId.slice(0, 8)} not found` }, { status: 404 });
  }

  const failed:   Array<{ row_index: number; sku: string; error: string }>          = [];
  const inserted: Array<{ row_index: number; product_id: string; sku: string }>     = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i] as InRow;
    const norm = normalizeRow(raw);
    if ('error' in norm) {
      failed.push({ row_index: i, sku: typeof raw.sku === 'string' ? raw.sku : '', error: norm.error });
      continue;
    }

    const productRow: Record<string, unknown> = {
      sku:                 norm.sku,
      name:                norm.name,
      category:            norm.category,
      unit_of_measure:     norm.unit_of_measure,
      primary_supplier_id: supplierId,
      is_bsc_processed:    false,
      status:              'active',
      sell_nassau:         norm.sell_nassau,
      sell_andros:         norm.sell_andros,
      sell_online:         norm.sell_online,
      sell_wholesale:      norm.sell_wholesale,
      created_by:          user.id,
    };
    if (norm.pack_size) productRow.pack_size = norm.pack_size;
    if (norm.image_url) productRow.image_url = norm.image_url;

    const { data: prodInsert, error: prodErr } = await admin
      .from('products')
      .insert(productRow)
      .select('id, sku')
      .single();

    if (prodErr) {
      const msg = prodErr.code === '23505' ? `SKU "${norm.sku}" already exists` : prodErr.message;
      failed.push({ row_index: i, sku: norm.sku, error: msg });
      continue;
    }

    const productId = (prodInsert as { id: string }).id;
    inserted.push({ row_index: i, product_id: productId, sku: norm.sku });

    // Optional cost row.
    if (norm.cost_per_unit !== null) {
      const { error: costErr } = await admin.from('product_costs').insert({
        product_id:       productId,
        supplier_id:      supplierId,
        cost_type:        'opening_balance',
        cost_per_unit:    norm.cost_per_unit,
        unit_of_measure:  norm.unit_of_measure,
        shipping_per_lb:  0,
        customs_duty_pct: 0,
        vat_levy_pct:     0,
        processing_fee:   0,
        effective_from:   nowIso,
        is_current:       true,
        recorded_by:      user.id,
      });
      if (costErr) console.warn(`bulk row ${i} cost insert failed (non-fatal):`, costErr.message);
    }

    // Optional pricing row for online channel.
    if (norm.online_price !== null && norm.sell_online) {
      const { error: priceErr } = await admin.from('product_pricing').insert({
        product_id:          productId,
        channel:             'online_market',
        pricing_mode:        'manual_override',
        manual_unit_price:   norm.online_price,
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
      if (priceErr) console.warn(`bulk row ${i} pricing insert failed (non-fatal):`, priceErr.message);
    }
  }

  // Audit row → ai_writes.
  try {
    await admin.from('ai_writes').insert({
      tool:      'supplier_bulk_add_products',
      caller_id: user.id,
      input:     { supplier_id: supplierId, row_count: rawRows.length },
      result:    {
        inserted_count: inserted.length,
        failed_count:   failed.length,
        role,
        // First 20 inserted skus only — full list can balloon ai_writes.
        sample_inserted_skus: inserted.slice(0, 20).map((r) => r.sku),
        sample_failed:        failed.slice(0, 20),
      },
      status:    failed.length === 0 ? 'success' : 'partial',
      error:     failed.length === rawRows.length ? 'all rows failed' : null,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({
    ok:                true,
    inserted:          inserted.length,
    failed,
    inserted_products: inserted,
  });
}
