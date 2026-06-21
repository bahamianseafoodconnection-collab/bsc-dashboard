// /api/supplier/bulk-add-products
//
// Bulk add products under a single supplier from the /supplier dashboard's
// extract-review / CSV-upload flow. The client sends the reviewed rows; this
// endpoint is the durable write step.
//
// Auth: founder + co_founder only (server-authoritative).
//
// ACCEPT-ALL, NORMALIZE, FLAG — NEVER DROP (2026-06-21):
//   Every extracted product MUST import. Rows whose unit (or any field) didn't
//   cleanly map are imported ANYWAY with a safe value and flagged
//   (products.needs_review = true + review_reason) for the founder to verify —
//   never rejected. Mechanisms:
//     • normalizeUnit() maps messy units (ctn, ea, cs, tin, jar, can, bale,
//       bdl, bundle, sleeve, carton) onto the canonical set, and defaults
//       anything unrecognized to 'each' + flag, so the unit CHECK can't bounce.
//     • SKUs are de-duped/suffixed up front so the unique constraint can't
//       reject (item-no SKUs from extraction are already unique; this is a net).
//     • Inserts run as ARRAY inserts (one .insert([...]) per table, chunked),
//       with a per-chunk → per-row → minimal-safe-defaults fallback. So
//       failed_count is 0 in practice; problem rows land flagged, never lost.
//
// PERFORMANCE: array inserts replace the old ~5-round-trips-per-row loop, so a
// 1,800-row sheet imports in one pass without FUNCTION_INVOCATION_TIMEOUT.
//
// PRICING DIRECTION (locked 2026-06-20, unchanged):
//   • stored cost = supplier quote × 0.93 when suppliers.operating_cost_accepted (D1).
//   • margins from pricing_rules (pricing_channel_v2); STORE only nassau_pos,
//     andros_pos, online_market (online_retail margin via the D4 map) (D5).
//   • margin_multiplier = price ÷ cost, never 1.0 (F-B).
//   • products land status='pending_approval' (Gate 2 = separate go-live) (D3a).
//
// Body: { supplier_id: UUID, rows: Array<{ sku, name, category,
//         unit_of_measure, brand?, pack_size?, units_per_case?, unit_type?,
//         cost_per_unit?, image_url?, channels:{nassau,andros,online,wholesale} }> }
//
// Response: { ok, inserted, failed, inserted_products, packing_incomplete,
//             needs_review_count, operating_cost_applied }

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);
const MAX_ROWS = 5000;              // array inserts make big sheets cheap; cap guards accidental pastes
const OPERATING_COST_FACTOR = 0.93; // 7% operating cost pushed onto supplier (D1)
const INSERT_CHUNK = 500;           // rows per array insert

// Canonical units — MUST match products_unit_of_measure_check (migration
// 20260621). normalizeUnit() guarantees every stored unit is one of these.
const CANONICAL_UNITS = new Set([
  'lb', 'oz', 'kg', 'g', 'each', 'case', 'gallon', 'bottle', 'pack', 'bag', 'box', 'dozen',
]);
const UNIT_VARIANTS: Record<string, string> = {
  ctn: 'case', carton: 'case', cs: 'case', ea: 'each', tin: 'each', can: 'each',
  jar: 'bottle', bale: 'bag', bdl: 'case', bundle: 'case', sleeve: 'pack',
};

// Map any pricelist unit to a canonical, constraint-valid unit. Flags anything
// that had to be mapped or defaulted so the founder can verify it.
function normalizeUnit(raw: string): { unit: string; flagged: boolean; reason: string | null } {
  const orig = (raw ?? '').trim();
  const r = orig.toLowerCase();
  if (!r)                     return { unit: 'each', flagged: true, reason: "unit missing — defaulted to 'each'" };
  if (CANONICAL_UNITS.has(r)) return { unit: r,      flagged: false, reason: null };
  const mapped = UNIT_VARIANTS[r];
  if (mapped)                 return { unit: mapped, flagged: true, reason: `unit '${orig}' auto-mapped to '${mapped}'` };
  return { unit: 'each', flagged: true, reason: `unit '${orig}' unrecognized — defaulted to 'each'` };
}

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
  category:        string;
  unit_of_measure: string;
  brand:           string | null;
  pack_size:       string | null;
  units_per_case:  number;
  unit_type:       string;
  cost_per_unit:   number | null;  // SUPPLIER QUOTE, pre-0.93
  image_url:       string | null;
  sell_nassau:     boolean;
  sell_andros:     boolean;
  sell_online:     boolean;
  sell_wholesale:  boolean;
  needs_review:    boolean;
  review_reason:   string | null;
}

// CATEGORY COERCION (F-J) — map free-text category to ONE canonical
// product_category enum value, dodging duplicate members. Unknown → 'other'.
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
    'beverage':        'beverage',
    'beverages':       'beverage',
    'drink':           'beverage',
    'juice':           'juice_smoothie',
    'smoothie':        'juice_smoothie',
    'spices':          'spices',
    'seasoning':       'spices',
    'household':       'household',
    'toiletry':        'toiletry',
    'toiletries':      'toiletry',
    'frozen':          'frozen_seafood',
  };
  return map[c] ?? 'other';
}

// NEVER rejects. Always returns a valid row; accumulates review flags for any
// field that had to be normalized or defaulted.
function normalizeRow(r: InRow): NormalizedRow {
  const reasons: string[] = [];

  let sku  = typeof r.sku === 'string' ? r.sku.trim() : '';
  let name = typeof r.name === 'string' ? r.name.trim() : '';
  const packSize    = typeof r.pack_size === 'string' && r.pack_size.trim() ? r.pack_size.trim() : null;
  const brand       = typeof r.brand === 'string' && r.brand.trim() ? r.brand.trim() : null;
  const costPerUnit = typeof r.cost_per_unit === 'number' && Number.isFinite(r.cost_per_unit) && r.cost_per_unit >= 0
                        ? r.cost_per_unit : null;
  const upcRaw      = typeof r.units_per_case === 'number' && Number.isFinite(r.units_per_case)
                        ? Math.round(r.units_per_case) : 1;
  const unitsPerCase = upcRaw >= 1 ? upcRaw : 1;
  const ch          = (r.channels && typeof r.channels === 'object') ? r.channels as Record<string, unknown> : {};

  // unit — always canonical; flag if mapped/defaulted.
  const u = normalizeUnit(typeof r.unit_of_measure === 'string' ? r.unit_of_measure : '');
  if (u.flagged && u.reason) reasons.push(u.reason);

  // name / sku fallbacks — never reject, just default + flag.
  if (!name) { name = sku || 'Unnamed product'; reasons.push('name missing — defaulted'); }
  if (!sku)  { reasons.push('sku missing — generated'); } // sku synthesized during dedupe (needs index)

  const imageUrl = typeof r.image_url === 'string' && r.image_url.trim() ? r.image_url.trim() : null;
  return {
    sku, name,
    category:        coerceCategory(r.category),
    unit_of_measure: u.unit,
    brand,
    pack_size:       packSize,
    units_per_case:  unitsPerCase,
    unit_type:       u.unit,   // trigger sync_unit_type_from_uom also sets this = uom
    cost_per_unit:   costPerUnit,
    image_url:       imageUrl,
    sell_nassau:     ch.nassau    === true,
    sell_andros:     ch.andros    === true,
    sell_online:     ch.online    === true,
    sell_wholesale:  ch.wholesale === true,
    needs_review:    reasons.length > 0,
    review_reason:   reasons.length ? reasons.join('; ') : null,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function storedCostFor(cost: number | null, accepted: boolean): number | null {
  if (cost === null) return null;
  return accepted ? Math.round(cost * OPERATING_COST_FACTOR * 10_000) / 10_000 : cost;
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
  const userId = user.id; // narrowed non-null; captured for use inside closures

  let body: BulkBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const supplierId = typeof body.supplier_id === 'string' ? body.supplier_id : '';
  const rawRows    = Array.isArray(body.rows) ? body.rows : null;
  if (!supplierId)                  return NextResponse.json({ ok: false, error: 'supplier_id is required' },  { status: 400 });
  if (!rawRows || rawRows.length === 0) return NextResponse.json({ ok: false, error: 'rows array is required and must be non-empty' }, { status: 400 });
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Batch too large: ${rawRows.length} rows (max ${MAX_ROWS} per request).` },
      { status: 400 },
    );
  }

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Verify supplier + read the operating-cost-accepted gate (D1/D3a).
  const { data: supplier, error: supErr } = await admin
    .from('suppliers')
    .select('id, code, name, operating_cost_accepted')
    .eq('id', supplierId)
    .maybeSingle();
  if (supErr || !supplier) {
    return NextResponse.json({ ok: false, error: `Supplier ${supplierId.slice(0, 8)} not found` }, { status: 404 });
  }
  const sup = supplier as { id: string; code: string; name: string; operating_cost_accepted?: boolean };
  const operatingCostAccepted = sup.operating_cost_accepted === true;

  // 2. Channel margins ONCE from pricing_rules (O1). markup_pct whole % → /100.
  const marginByChannel = new Map<string, number>();
  const { data: rules } = await admin
    .from('pricing_rules')
    .select('channel, markup_pct')
    .in('channel', ['nassau_pos', 'andros_pos', 'online_retail']);
  for (const r of (rules ?? []) as Array<{ channel: string; markup_pct: number }>) {
    marginByChannel.set(r.channel, Number(r.markup_pct) / 100);
  }

  // STORE only the 3 fixed channels (D5). online_retail→online_market is D4.
  const PRICING_PLAN: Array<{ flag: keyof NormalizedRow; marginKey: string; writeChannel: string }> = [
    { flag: 'sell_nassau', marginKey: 'nassau_pos',    writeChannel: 'nassau_pos'    },
    { flag: 'sell_andros', marginKey: 'andros_pos',    writeChannel: 'andros_pos'    },
    { flag: 'sell_online', marginKey: 'online_retail', writeChannel: 'online_market' },
  ];

  const nowIso = new Date().toISOString();

  // 3. Normalize every row (never rejects) + compute stored (true) cost.
  const norms = (rawRows as InRow[]).map((raw, i) => {
    const norm = normalizeRow(raw);
    return { i, norm, storedCost: storedCostFor(norm.cost_per_unit, operatingCostAccepted) };
  });

  // 4. De-dupe SKUs against this supplier's existing skus AND within the batch,
  //    suffixing collisions so the unique constraint can never reject. Synthesize
  //    a sku for any row missing one. Flag suffixed/synthesized rows.
  const { data: existing } = await admin
    .from('products')
    .select('sku')
    .ilike('sku', `${sup.code}-%`);
  const used = new Set<string>(((existing ?? []) as Array<{ sku: string }>).map((r) => r.sku.toLowerCase()));

  for (const item of norms) {
    let base = (item.norm.sku || `${sup.code}-ROW${item.i + 1}`).slice(0, 64);
    let sku = base;
    if (used.has(sku.toLowerCase())) {
      const stem = base.slice(0, 60);
      let n = 2;
      sku = `${stem}-${n}`;
      while (used.has(sku.toLowerCase())) { n += 1; sku = `${stem}-${n}`; }
      item.norm.needs_review  = true;
      item.norm.review_reason = `${item.norm.review_reason ? item.norm.review_reason + '; ' : ''}SKU collided — stored as ${sku}`;
    }
    used.add(sku.toLowerCase());
    item.norm.sku = sku;
  }

  // 5. Build product rows + ARRAY-insert (chunked) with a no-drop fallback.
  function buildProductRow(norm: NormalizedRow): Record<string, unknown> {
    const row: Record<string, unknown> = {
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
      created_by:          userId,
      needs_review:        norm.needs_review,
    };
    if (norm.review_reason) row.review_reason = norm.review_reason;
    if (norm.brand)         row.brand         = norm.brand;
    if (norm.pack_size)     row.pack_size     = norm.pack_size;
    if (norm.image_url)     row.image_url     = norm.image_url;
    return row;
  }

  const idBySku = new Map<string, string>();                         // sku.toLowerCase() → product id
  const failed:  Array<{ sku: string; error: string }> = [];

  for (const group of chunk(norms, INSERT_CHUNK)) {
    const rows = group.map((g) => buildProductRow(g.norm));
    const { data, error } = await admin.from('products').insert(rows).select('id, sku');
    if (!error && data) {
      for (const d of data as Array<{ id: string; sku: string }>) idBySku.set(d.sku.toLowerCase(), d.id);
      continue;
    }
    // Chunk failed → isolate per row so one bad row can't sink the rest.
    for (const g of group) {
      const row = buildProductRow(g.norm);
      const one = await admin.from('products').insert(row).select('id, sku').single();
      if (!one.error && one.data) { idBySku.set((one.data as { sku: string }).sku.toLowerCase(), (one.data as { id: string }).id); continue; }
      // Last resort — import with maximally-safe values + flag. Never drop.
      const safe = {
        ...row,
        unit_of_measure: 'each',
        category:        'other',
        needs_review:    true,
        review_reason:   `${row.review_reason ? row.review_reason + '; ' : ''}import error: ${one.error?.message ?? 'unknown'}`,
      };
      const two = await admin.from('products').insert(safe).select('id, sku').single();
      if (!two.error && two.data) { idBySku.set((two.data as { sku: string }).sku.toLowerCase(), (two.data as { id: string }).id); continue; }
      failed.push({ sku: g.norm.sku, error: two.error?.message ?? one.error?.message ?? 'insert failed' });
    }
  }

  // 6. Cost rows (true cost) — array-insert (chunked, non-fatal).
  const costRows: Record<string, unknown>[] = [];
  for (const { norm, storedCost } of norms) {
    const id = idBySku.get(norm.sku.toLowerCase());
    if (!id || storedCost === null) continue;
    costRows.push({
      product_id:       id,
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
  }
  for (const group of chunk(costRows, INSERT_CHUNK)) {
    const { error } = await admin.from('product_costs').insert(group);
    if (error) console.warn('bulk cost insert chunk failed (non-fatal):', error.message);
  }

  // 7. Pricing rows — 3 fixed channels, off stored cost, margin = price÷cost
  //    (never 1.0). Skip a channel whose margin is missing. Array-insert (chunked).
  const priceRows: Record<string, unknown>[] = [];
  for (const { norm, storedCost } of norms) {
    const id = idBySku.get(norm.sku.toLowerCase());
    if (!id || storedCost === null || storedCost <= 0) continue;
    for (const plan of PRICING_PLAN) {
      if (norm[plan.flag] !== true) continue;
      const margin = marginByChannel.get(plan.marginKey);
      if (margin === undefined) continue; // no margin row → skip, never guess
      const price = Math.round(storedCost * (1 + margin) * 100) / 100;
      const mult  = Math.round((price / storedCost) * 1_000_000) / 1_000_000;
      priceRows.push({
        product_id:          id,
        channel:             plan.writeChannel,
        pricing_mode:        'manual_override',
        manual_unit_price:   price,
        margin_multiplier:   mult,
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
    }
  }
  for (const group of chunk(priceRows, INSERT_CHUNK)) {
    const { error } = await admin.from('product_pricing').insert(group);
    if (error) console.warn('bulk pricing insert chunk failed (non-fatal):', error.message);
  }

  // 8. Tallies.
  const insertedProducts = norms
    .filter(({ norm }) => idBySku.has(norm.sku.toLowerCase()))
    .map(({ i, norm }) => ({ row_index: i, product_id: idBySku.get(norm.sku.toLowerCase())!, sku: norm.sku }));
  const packingIncomplete = norms
    .filter(({ norm }) => idBySku.has(norm.sku.toLowerCase()) && norm.units_per_case <= 1)
    .map(({ norm }) => norm.sku);
  const needsReviewCount = norms
    .filter(({ norm }) => idBySku.has(norm.sku.toLowerCase()) && norm.needs_review).length;

  // 9. Audit row → ai_writes (D2). Non-fatal.
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
        inserted_count:           insertedProducts.length,
        failed_count:             failed.length,
        needs_review_count:       needsReviewCount,
        role,
        landed_status:            'pending_approval',
        packing_incomplete_count: packingIncomplete.length,
        sample_inserted_skus:     insertedProducts.slice(0, 20).map((r) => r.sku),
        sample_failed:            failed.slice(0, 20),
      },
      status:    failed.length === 0 ? 'success' : 'partial',
      error:     failed.length > 0 ? `${failed.length} row(s) could not insert` : null,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({
    ok:                     true,
    inserted:               insertedProducts.length,
    failed,
    inserted_products:      insertedProducts,
    packing_incomplete:     packingIncomplete,
    needs_review_count:     needsReviewCount,
    operating_cost_applied: operatingCostAccepted,
  });
}
