// /api/products/intake-submit
//
// Server-side intake submission. Why this exists:
//
// The /founder-ai/products/intake page used to write directly to
// `products` + `product_costs` + `product_pricing` using the caller's
// JWT. That works for admin roles but fails silently for cashier /
// fisherman / supplier / captain / receiver / etc. because RLS on the
// products table doesn't grant INSERT to those roles.
//
// This route uses the SUPABASE_SERVICE_ROLE_KEY so every authenticated
// role can submit. The caller's JWT is still verified (we extract the
// user id + role for the log row), but the actual writes happen under
// service_role and bypass RLS.
//
// Inputs (multipart/form-data):
//   • photos[]      — File array (1–3 files), already uploaded to
//                     site-images by the client (so this endpoint
//                     receives the public URLs as JSON instead — see
//                     below). KEEP IT SIMPLE: this endpoint takes JSON
//                     with photo URLs the client already uploaded.
//
// Actual contract (JSON body):
//   {
//     sku:           string,
//     name:          string,
//     description?:  string,
//     category:      string,
//     unit:          string,
//     vat_category:  string,
//     cost_per_unit: number,
//     supplier_id?:  string,
//     prices:        Array<{ channel: string; price: number }>,
//     image_url:     string,            // primary photo
//     photo_urls:    string[],          // all uploaded photo URLs
//     photo_geo:     PhotoGeoMeta[],    // GPS metadata array
//     submitted_by_role: string | null
//   }
//
// Returns: { ok, product_id, sku, intake_log_id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  sku?:               unknown;
  name?:              unknown;
  description?:       unknown;
  category?:          unknown;
  unit?:              unknown;
  vat_category?:      unknown;
  cost_per_unit?:     unknown;
  supplier_id?:       unknown;
  prices?:            unknown;
  image_url?:         unknown;
  photo_urls?:        unknown;
  photo_geo?:         unknown;
  submitted_by_role?: unknown;
}

const ALLOWED_ROLES = new Set([
  'founder','co_founder','control_admin','basic_admin','manager',
  'cashier','andros_staff','processor','supplier','fisherman',
  'captain','farmer','partner','receiver',
]);

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
  const token = authHeader.slice(7);

  // Verify caller via anon client + their JWT.
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });

  // Verify role.
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const callerRole = (prof as { role?: string | null } | null)?.role ?? null;
  if (!callerRole || !ALLOWED_ROLES.has(callerRole)) {
    return NextResponse.json({ ok: false, error: `Role "${callerRole ?? 'none'}" is not permitted to submit intake.` }, { status: 403 });
  }

  // Parse + coerce body.
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const sku           = typeof body.sku === 'string' ? body.sku.trim() : '';
  const name          = typeof body.name === 'string' ? body.name.trim() : '';
  const description   = typeof body.description === 'string' ? body.description.trim() : null;
  const category      = typeof body.category === 'string' ? body.category : 'grocery';
  const unit          = typeof body.unit === 'string' ? body.unit : 'each';
  const vat_category  = typeof body.vat_category === 'string' ? body.vat_category : 'uncooked_food';
  const cost_per_unit = typeof body.cost_per_unit === 'number' ? body.cost_per_unit : 0;
  const supplier_id   = typeof body.supplier_id === 'string' && body.supplier_id ? body.supplier_id : null;
  const image_url     = typeof body.image_url === 'string' ? body.image_url : null;
  const photo_urls    = Array.isArray(body.photo_urls) ? body.photo_urls.filter((u): u is string => typeof u === 'string') : [];
  const photo_geo     = Array.isArray(body.photo_geo)  ? body.photo_geo  : [];
  const submitted_by_role = typeof body.submitted_by_role === 'string' ? body.submitted_by_role : callerRole;
  const prices        = Array.isArray(body.prices) ? body.prices.filter((p): p is { channel: string; price: number } =>
                          !!p && typeof p === 'object'
                          && typeof (p as { channel?: unknown }).channel === 'string'
                          && typeof (p as { price?: unknown }).price === 'number',
                        ) : [];

  if (!sku || !name || cost_per_unit <= 0 || photo_urls.length === 0 || prices.length === 0) {
    return NextResponse.json({ ok: false, error: 'Missing required fields (sku, name, cost_per_unit, photo_urls, prices).' }, { status: 400 });
  }

  // Service-role client — bypasses RLS for the actual writes.
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const nowIso = new Date().toISOString();

  // 1. INSERT products in pending state (all sell_* off).
  const { data: prod, error: prodErr } = await admin
    .from('products')
    .insert({
      sku, name, description,
      category,
      unit_of_measure: unit,
      unit_type: unit === 'lb' ? 'lb' : null,
      is_bsc_processed: false,
      primary_supplier_id: supplier_id,
      status: 'active',
      sell_nassau:    false,
      sell_andros:    false,
      sell_online:    false,
      sell_wholesale: false,
      image_url,
      vat_category,
      created_by: user.id,
    })
    .select('id, sku, name')
    .single();
  if (prodErr || !prod) {
    return NextResponse.json({ ok: false, error: `Product insert failed: ${prodErr?.message ?? 'no row'}` }, { status: 400 });
  }
  const productId = prod.id as string;

  // 2. INSERT product_costs (immutable; trigger expires nothing — first cost row).
  {
    const { error: costErr } = await admin.from('product_costs').insert({
      product_id:      productId,
      supplier_id,
      cost_type:       'opening_balance',
      cost_per_unit,
      unit_of_measure: unit,
      shipping_per_lb: 0,
      customs_duty_pct: 0,
      vat_levy_pct:    0,
      processing_fee:  0,
      effective_from:  nowIso,
      is_current:      true,
      recorded_by:     user.id,
    });
    if (costErr) console.warn('product_costs insert failed (non-fatal):', costErr.message);
  }

  // 3. INSERT product_pricing rows for the 3 retail channels.
  {
    const rows = prices.map(p => ({
      product_id:         productId,
      channel:            p.channel,
      pricing_mode:       'manual_override',
      margin_multiplier:  1.0,
      vat_multiplier:     1.0,
      manual_unit_price:  p.price,
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
    const { error: prErr } = await admin.from('product_pricing').insert(rows);
    if (prErr) {
      // Roll back the product row so nothing dangles.
      await admin.from('products').delete().eq('id', productId);
      return NextResponse.json({ ok: false, error: `product_pricing insert failed: ${prErr.message} (rolled back).` }, { status: 400 });
    }
  }

  // 4. INSERT product_intake_log (audit trail — role + photos + GPS).
  let intakeLogId: string | null = null;
  {
    const { data: log } = await admin.from('product_intake_log').insert({
      submitted_by:      user.id,
      submitted_by_role,
      submission_source: 'web',
      raw_payload: {
        sku, name, description, category, unit_of_measure: unit,
        cost_per_unit, vat_category, supplier_id,
      },
      photo_urls,
      photo_geo,
      proposed_sku:    sku,
      proposed_name:   name,
      proposed_supplier_id: supplier_id,
      extracted_fields: null,
      status:          'pending',
      product_id:      productId,
    }).select('id').single();
    intakeLogId = (log as { id?: string } | null)?.id ?? null;
  }

  return NextResponse.json({
    ok:           true,
    product_id:   productId,
    sku:          prod.sku,
    intake_log_id: intakeLogId,
  });
}
