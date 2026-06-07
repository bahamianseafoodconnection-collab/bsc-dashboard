// /api/supplier-portal/add-product
//
// Supplier self-listing endpoint. Lands the product in the PENDING
// approval queue at /founder-ai/products/pending (all sell_* flags
// false + status='active' = "awaiting founder review").
//
// Auth: 'supplier' or 'partner_us'.
// Ownership: product is INSERTed with primary_supplier_id = the
//   suppliers.id linked to the caller's portal_user_id. Supplier
//   cannot list a product under someone else's name.
//
// Channels the supplier can REQUEST:
//   - online    (BSC retail on /market)
//   - wholesale (BSC wholesale tier)
//
// Pricing flow: supplier enters cost_per_unit. We INSERT
//   • products row (sell_* flags ALL false; status='active';
//     requested_channels stored from supplier intent)
//   • product_costs row (opening_balance)
// We DO NOT write any product_pricing / channel pricing rows here.
// Per-channel margin + price are set by the founder in the management
// grid at approval — that's where the 35 retail / 15 wholesale (or
// per-item override) gets applied. Removing pricing-at-upload prevents
// the supplier endpoint from baking in a guessed markup.
//
// Body:
//   { name, category, unit_of_measure, pack_size?, image_url?,
//     cost_per_unit, channels: { online: bool, wholesale: bool } }

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['supplier', 'partner_us']);

interface Body {
  name?:            unknown;
  category?:        unknown;
  unit_of_measure?: unknown;
  pack_size?:       unknown;
  image_url?:       unknown;
  cost_per_unit?:   unknown;
  channels?:        unknown;
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveCaller(req: NextRequest) {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const header = req.headers.get('authorization') ?? '';
  if (!url || !anon || !header.startsWith('Bearer ')) {
    return { userId: null as string | null, role: null as string | null, isSupplier: false };
  }
  const client = createClient(url, anon, {
    global: { headers: { Authorization: header } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { userId: null, role: null, isSupplier: false };
  const { data: prof } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  return { userId: user.id, role, isSupplier: !!role && ALLOWED_ROLES.has(role) };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

export async function POST(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const caller = await resolveCaller(req);
  if (!caller.userId)     return NextResponse.json({ ok: false, error: 'Sign-in required.' }, { status: 401 });
  if (!caller.isSupplier) return NextResponse.json({ ok: false, error: 'Supplier role required.' }, { status: 403 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const name        = typeof body.name === 'string' ? body.name.trim() : '';
  const category    = typeof body.category === 'string' ? body.category.trim() : '';
  const unit        = typeof body.unit_of_measure === 'string' ? body.unit_of_measure.trim() : '';
  const pack        = typeof body.pack_size === 'string' && body.pack_size.trim() ? body.pack_size.trim() : null;
  const imageUrl    = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;
  const costRaw     = body.cost_per_unit;
  const cost        = typeof costRaw === 'number' && Number.isFinite(costRaw) && costRaw > 0 ? costRaw : NaN;
  const ch          = (body.channels && typeof body.channels === 'object') ? body.channels as Record<string, unknown> : {};
  const sellOnline  = ch.online    === true;
  const sellWhsale  = ch.wholesale === true;

  if (!name)          return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  if (!category)      return NextResponse.json({ ok: false, error: 'category required' }, { status: 400 });
  if (!unit)          return NextResponse.json({ ok: false, error: 'unit_of_measure required' }, { status: 400 });
  if (!Number.isFinite(cost) || cost <= 0) {
    return NextResponse.json({ ok: false, error: 'cost_per_unit must be > 0' }, { status: 400 });
  }
  if (!sellOnline && !sellWhsale) {
    return NextResponse.json({ ok: false, error: 'Pick at least one channel: Online or Wholesale' }, { status: 400 });
  }

  // Resolve supplier identity.
  const { data: supplierRow, error: supErr } = await admin
    .from('suppliers').select('id, code, name').eq('portal_user_id', caller.userId).maybeSingle();
  if (supErr || !supplierRow) {
    return NextResponse.json({
      ok: false,
      error: 'No supplier record linked to your account. Ask Dedrick to link your portal_user_id on the suppliers table.',
    }, { status: 404 });
  }
  const supplier = supplierRow as { id: string; code: string; name: string };

  // Supplier-listed products land PENDING — every sell_* flag is forced
  // false on insert regardless of what the supplier ticked. Combined with
  // status='active', this matches the filter at /founder-ai/products/pending
  // (rows are channels-off + active = "awaiting founder review"). The
  // founder flips the actual sell_* flags during approval.
  //
  // requested_channels stores the supplier's intent as a comma-separated
  // string ("online,wholesale" / "online" / "wholesale") so the founder
  // sees which channels the supplier asked for when reviewing.
  const requestedChannels = [sellOnline && 'online', sellWhsale && 'wholesale']
    .filter(Boolean).join(',') || null;

  // Generate SKU + INSERT product.
  const sku = `${supplier.code}-${slug(name)}-${Date.now().toString(36).slice(-4)}`.slice(0, 64);
  const productRow: Record<string, unknown> = {
    sku,
    name,
    category,
    unit_of_measure:     unit,
    pack_size:           pack,
    image_url:           imageUrl,
    primary_supplier_id: supplier.id,
    is_bsc_processed:    false,
    status:              'active',
    sell_nassau:         false,
    sell_andros:         false,
    sell_online:         false,
    sell_wholesale:      false,
    requested_channels:  requestedChannels,
    online_only:         false,
    requires_yield_calc: false,
    sell_export:         false,
    created_by:          caller.userId,
  };

  const { data: prodInsert, error: prodErr } = await admin
    .from('products')
    .insert(productRow)
    .select('id, sku')
    .single();
  if (prodErr) {
    return NextResponse.json({
      ok: false,
      error: prodErr.code === '23505' ? `SKU "${sku}" already exists — try a different name.` : prodErr.message,
    }, { status: 500 });
  }
  const productId = (prodInsert as { id: string }).id;

  // Cost row (opening_balance). Failure non-fatal — product still exists,
  // just no pricing can compute yet. Surface as warning.
  const { error: costErr } = await admin.from('product_costs').insert({
    product_id:       productId,
    supplier_id:      supplier.id,
    cost_type:        'opening_balance',
    cost_per_unit:    cost,
    unit_of_measure:  unit,
    shipping_per_lb:  0,
    customs_duty_pct: 0,
    vat_levy_pct:     0,
    processing_fee:   0,
    effective_from:   new Date().toISOString(),
    is_current:       true,
    recorded_by:      caller.userId,
  });
  if (costErr) {
    return NextResponse.json({
      ok:         true,
      warning:    `Product created but cost insert failed: ${costErr.message}. Founder needs to record the cost.`,
      product_id: productId, sku,
    });
  }

  // No channel pricing written here — founder sets margin + price at
  // approval in the management grid. requested_channels carries the
  // supplier's intent through to the pending queue.
  return NextResponse.json({
    ok:                 true,
    product_id:         productId,
    sku,
    requested_channels: requestedChannels,
    note:               'Pending founder approval. Channel pricing will be set in the management grid.',
  });
}
