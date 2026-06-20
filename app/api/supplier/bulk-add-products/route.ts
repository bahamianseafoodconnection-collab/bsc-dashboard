// /api/supplier/bulk-add-products
//
// Bulk add products under a single supplier from the /supplier
// dashboard's CSV upload modal (Phase 2, 2026-05-26; pricing-pipeline
// rewrite 2026-06-20 — see docs/DECISIONS.md "2026-06-20 — Supplier→Channel
// Pricing Pipeline").
//
// Sister endpoint to /api/supplier/add-product — same auth + validation
// per row, loops over an array of rows and collects per-row failures
// instead of aborting the whole batch. The client uploads after previewing
// the parsed CSV; this endpoint is the durable write step.
//
// Auth: founder + co_founder only (server-authoritative).
//
// PRICING DIRECTION (locked 2026-06-20):
//   • Stored cost = supplier quote × 0.93 when suppliers.operating_cost_accepted
//     = true (the 7% operating cost is pushed onto the supplier at intake).
//     That stored number IS true cost — no stripping downstream. (D1)
//   • Margins live in pricing_rules on the pricing_channel_v2 enum
//     (nassau_pos 40, andros_pos 40, online_retail 35). markup_pct is whole
//     percent (40.00 → 0.40). (O1)
//   • STORE only the 3 fixed channels: nassau_pos, andros_pos, and
//     online_market (priced off pricing_rules.online_retail via the D4
//     translation map). Wholesale (22/19) is NOT stored — it is a cart-time
//     case-break. (D5)
//   • margin_multiplier = price ÷ cost, ALWAYS — never 1.0. This is the F-B
//     footgun fix: recalc_channel_prices_on_purchase recomputes
//     price = cost × margin_multiplier, so a stored 1.0 would collapse the
//     price to cost on the next purchase.
//   • Products land status='pending_approval'. Go-live is a separate
//     per-product "Enable Live" gate (D3a Gate 2). Packing may be incomplete
//     at intake (flag, never reject — D7).
//
// Body:
//   {
//     supplier_id: UUID,
//     rows: Array<{
//       sku, name, category, unit_of_measure: string;
//       brand?:          string;
//       pack_size?:      string;
//       units_per_case?: number;   // sub-units per case; default 1
//       unit_type?:      string;   // default 'piece'
//       cost_per_unit?:  number;   // SUPPLIER QUOTE, pre-0.93
//       image_url?:      string;
//       channels: { nassau, andros, online, wholesale: boolean };
//     }>
//   }
//
// Response:
//   {
//     ok: true,
//     inserted: number,
//     failed: Array<{ row_index, sku, error }>,
//     inserted_products: Array<{ row_index, product_id, sku }>,
//     packing_incomplete: string[],     // skus where units_per_case <= 1
//     operating_cost_applied: boolean,  // was ×0.93 in effect for this supplier
//   }
//
// Max batch size: 500 rows per request.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);
const MAX_ROWS = 500;
const OPERATING_COST_FACTOR = 0.93; // 7% operating cost pushed onto supplier (D1)

interface InRow {
  sku?:             unknown;
  name?:            unknown;
  category?:        unknown;
  unit_of_measure?: unknown;
  brand?:           unknown;
  pack_size?:       unknown;
  units_per_case?:  unknown;
  unit_type?:       unknown;
  cost_per_unit?:   unknown;
  image_url?:       unknown;
  channels?:        unknown;
}

interface BulkBody {
  supplier_id?: unknown;
  rows?:        unknown;
}

interface NormalizedRow {
  sku:             string;
  name:            string;
  category:        string;       // coerced canonical product_category value
  unit_of_measure: string;
  brand:           string | null;
  pack_size:       string | null;
  units_per_case:  number;       // integer >= 1
  unit_type:       string;
  cost_per_unit:   number | null; // SUPPLIER QUOTE, pre-0.93
  image_url:       string | null;
  sell_nassau:     boolean;
  sell_andros:     boolean;
  sell_online:     boolean;
  sell_wholesale:  boolean;
}

// CATEGORY COERCION (F-J) — map free-text category to ONE canonical
// product_category enum value, dodging the duplicate enum members
// (beverage/beverages, toiletry/toiletries → keep the singular). Unknown
// falls through to 'other'.
function coerceCategory(raw: unknown): string {
  const c = (typeof raw === 'string' ? raw : '').toLowerCase().trim();
  const map: Record<string, string> = {
    'seafood':         'fresh_seafood',
    'fresh seafood':   'fresh_seafood',
    'frozen seafood':  'frozen_seafood',
    'meat':            'meat',
    'poultry':         'meat',
    'frozen meat':     'frozen_meat',
    'produce':         'produce',
    'fruit':           'produce',
    'vegetable':       'produce',
    'dry goods':       'dry_goods',
    'pantry':          'dry_goods',
    'snack':           'snack',
    'beverage':        'beverage',   // NOT 'beverages'
    'beverages':       'beverage',
    'drink':           'beverage',
    'juice':           'juice_smoothie',
    'smoothie':        'juice_smoothie',
    'spices':          'spices',
    'seasoning':       'spices',
    'household':       'household',
    'toiletry':        'toiletry',   // NOT 'toiletries'
    'toiletries':      'toiletry',
    'frozen':          'frozen_seafood',
  };
  return map[c] ?? 'other';
}

function normalizeRow(r: InRow): NormalizedRow | { error: string } {
  const sku           = typeof r.sku === 'string' ? r.sku.trim() : '';
  const name          = typeof r.name === 'string' ? r.name.trim() : '';
  const unitOfMeasure = typeof r.unit_of_measure === 'string' ? r.unit_of_measure.trim() : '';
  const packSize      = typeof r.pack_size === 'string' && r.pack_size.trim() ? r.pack_size.trim() : null;
  const brand         = typeof r.brand === 'string' && r.brand.trim() ? r.brand.trim() : null;
  const unitType      = typeof r.unit_type === 'string' && r.unit_type.trim() ? r.unit_type.trim() : 'piece';
  const costPerUnit   = typeof r.cost_per_unit === 'number' && Number.isFinite(r.cost_per_unit) && r.cost_per_unit >= 0
                          ? r.cost_per_unit : null;
  // units_per_case: integer >= 1, default 1 if absent/invalid. NEVER reject a
  // row for missing/default packing — Gate 2 blocks go-live, not intake (D7).
  const upcRaw        = typeof r.units_per_case === 'number' && Number.isFinite(r.units_per_case)
                          ? Math.round(r.units_per_case) : 1;
  const unitsPerCase  = upcRaw >= 1 ? upcRaw : 1;
  const ch            = (r.channels && typeof r.channels === 'object') ? r.channels as Record<string, unknown> : {};

  if (!sku)           return { error: 'sku is required' };
  if (!name)          return { error: 'name is required' };
  if (!unitOfMeasure) return { error: 'unit_of_measure is required' };

  const imageUrl = typeof r.image_url === 'string' && r.image_url.trim() ? r.image_url.trim() : null;
  return {
    sku, name,
    category:        coerceCategory(r.category),
    unit_of_measure: unitOfMeasure,
    brand,
    pack_size:       packSize,
    units_per_case:  unitsPerCase,
    unit_type:       unitType,
    cost_per_unit:   costPerUnit,
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

  // 1. Verify supplier exists + read the operating-cost-accepted gate (D1/D3a).
  const { data: supplier, error: supErr } = await admin
    .from('suppliers')
    .select('id, code, name, operating_cost_accepted')
    .eq('id', supplierId)
    .maybeSingle();
  if (supErr || !supplier) {
    return NextResponse.json({ ok: false, error: `Supplier ${supplierId.slice(0, 8)} not found` }, { status: 404 });
  }
  const operatingCostAccepted = (supplier as { operating_cost_accepted?: boolean }).operating_cost_accepted === true;

  // 2. Read channel margins ONCE from pricing_rules (the governing source, O1).
  //    markup_pct is whole percent (40.00) → divide by 100 to get 0.40.
  const marginByChannel = new Map<string, number>();
  const { data: rules } = await admin
    .from('pricing_rules')
    .select('channel, markup_pct')
    .in('channel', ['nassau_pos', 'andros_pos', 'online_retail']);
  for (const r of (rules ?? []) as Array<{ channel: string; markup_pct: number }>) {
    marginByChannel.set(r.channel, Number(r.markup_pct) / 100);
  }

  // STORE only the 3 fixed channels (D5). Each entry: sell flag → margin key
  // (pricing_rules / pricing_channel_v2) → write channel (product_pricing /
  // pricing_channel). online_retail→online_market is the D4 translation.
  const PRICING_PLAN: Array<{ flag: keyof NormalizedRow; marginKey: string; writeChannel: string }> = [
    { flag: 'sell_nassau', marginKey: 'nassau_pos',    writeChannel: 'nassau_pos'    },
    { flag: 'sell_andros', marginKey: 'andros_pos',    writeChannel: 'andros_pos'    },
    { flag: 'sell_online', marginKey: 'online_retail', writeChannel: 'online_market' },
  ];

  const failed:    Array<{ row_index: number; sku: string; error: string }>      = [];
  const inserted:  Array<{ row_index: number; product_id: string; sku: string }> = [];
  const packingIncomplete: string[] = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i] as InRow;
    const norm = normalizeRow(raw);
    if ('error' in norm) {
      failed.push({ row_index: i, sku: typeof raw.sku === 'string' ? raw.sku : '', error: norm.error });
      continue;
    }

    // stored_cost = TRUE COST. Supplier quote × 0.93 when the supplier accepted
    // the operating-cost term; otherwise the quote as-is. (D1)
    const storedCost = norm.cost_per_unit === null
      ? null
      : (operatingCostAccepted
          ? Math.round(norm.cost_per_unit * OPERATING_COST_FACTOR * 10_000) / 10_000
          : norm.cost_per_unit);

    const productRow: Record<string, unknown> = {
      sku:                 norm.sku,
      name:                norm.name,
      category:            norm.category,
      unit_of_measure:     norm.unit_of_measure,
      unit_type:           norm.unit_type,
      units_per_case:      norm.units_per_case,
      primary_supplier_id: supplierId,
      is_bsc_processed:    false,
      status:              'pending_approval',
      sell_nassau:         norm.sell_nassau,
      sell_andros:         norm.sell_andros,
      sell_online:         norm.sell_online,
      sell_wholesale:      norm.sell_wholesale,
      created_by:          user.id,
    };
    if (norm.brand)      productRow.brand     = norm.brand;
    if (norm.pack_size)  productRow.pack_size = norm.pack_size;
    if (norm.image_url)  productRow.image_url = norm.image_url;

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
    // Flag rows that came in without real packing — allowed in, but Gate 2
    // (Enable Live) is blocked until a reviewer sets a real units_per_case.
    if (norm.units_per_case <= 1) packingIncomplete.push(norm.sku);

    // Cost row — stored_cost is the TRUE cost. Non-fatal on error.
    if (storedCost !== null) {
      const { error: costErr } = await admin.from('product_costs').insert({
        product_id:       productId,
        supplier_id:      supplierId,
        cost_type:        'opening_balance',
        cost_per_unit:    storedCost,
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

    // Pricing rows — 3 fixed channels only, off stored_cost. margin_multiplier
    // = price ÷ cost (never 1.0 — F-B). Skip a channel whose margin is missing;
    // do NOT guess. Non-fatal on error.
    if (storedCost !== null && storedCost > 0) {
      for (const plan of PRICING_PLAN) {
        if (norm[plan.flag] !== true) continue;
        const margin = marginByChannel.get(plan.marginKey);
        if (margin === undefined) continue; // no margin row → skip, never guess
        const price = Math.round(storedCost * (1 + margin) * 100) / 100;
        const mult  = Math.round((price / storedCost) * 1_000_000) / 1_000_000;
        const { error: priceErr } = await admin.from('product_pricing').insert({
          product_id:          productId,
          channel:             plan.writeChannel,
          pricing_mode:        'manual_override',
          manual_unit_price:   price,
          margin_multiplier:   mult,   // = price ÷ cost, never 1.0
          vat_multiplier:      1.0,    // VAT applied last at checkout per org_settings.vat_active (F-D)
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
        if (priceErr) console.warn(`bulk row ${i} pricing insert (${plan.writeChannel}) failed (non-fatal):`, priceErr.message);
      }
    }
  }

  // Audit row → ai_writes (D2). Non-fatal.
  try {
    await admin.from('ai_writes').insert({
      tool:      'supplier_bulk_add_products',
      caller_id: user.id,
      input:     {
        supplier_id:             supplierId,
        row_count:               rawRows.length,
        operating_cost_accepted: operatingCostAccepted,
        operating_cost_factor:   operatingCostAccepted ? OPERATING_COST_FACTOR : 1.0,
      },
      result:    {
        inserted_count:          inserted.length,
        failed_count:            failed.length,
        role,
        landed_status:           'pending_approval',
        packing_incomplete_count: packingIncomplete.length,
        // First 20 only — full lists can balloon ai_writes.
        sample_inserted_skus:    inserted.slice(0, 20).map((r) => r.sku),
        sample_failed:           failed.slice(0, 20),
      },
      status:    failed.length === 0
                   ? 'success'
                   : (failed.length === rawRows.length ? 'error' : 'partial'),
      error:     failed.length === rawRows.length ? 'all rows failed' : null,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({
    ok:                     true,
    inserted:               inserted.length,
    failed,
    inserted_products:      inserted,
    packing_incomplete:     packingIncomplete,
    operating_cost_applied: operatingCostAccepted,
  });
}
