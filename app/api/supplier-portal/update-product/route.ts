// /api/supplier-portal/update-product
//
// Supplier self-service inline edit on /supplier-portal.
//
// Auth: 'supplier' or 'partner_us'.
// Ownership: caller can only PATCH products where
//   products.primary_supplier_id == suppliers.id of the row linked to
//   their portal_user_id.
//
// Accepted fields (narrower than the founder /api/admin/products/[id]):
//   name, category, unit_of_measure, pack_size, image_url, status,
//   sell_nassau, sell_andros, sell_online, sell_wholesale, cost_per_unit
// (cost_per_unit INSERTs a new product_costs row server-side; the
//  product_costs immutability trigger handles flipping the old row.)
//
// Service role on writes (supplier sessions don't have UPDATE on products).
//
// Body: { product_id: UUID, patch: { ...editable fields } }

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['supplier', 'partner_us']);
const EDITABLE_FIELDS = new Set([
  'name', 'category', 'unit_of_measure', 'pack_size', 'image_url', 'status',
  'sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale',
]);
const ALLOWED_STATUSES = new Set(['active', 'inactive']);

interface Body {
  product_id?: unknown;
  patch?:      unknown;
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

export async function POST(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const caller = await resolveCaller(req);
  if (!caller.userId)     return NextResponse.json({ ok: false, error: 'Sign-in required.' }, { status: 401 });
  if (!caller.isSupplier) return NextResponse.json({ ok: false, error: 'Supplier role required.' }, { status: 403 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  if (!productId) return NextResponse.json({ ok: false, error: 'product_id required.' }, { status: 400 });
  if (!body.patch || typeof body.patch !== 'object') {
    return NextResponse.json({ ok: false, error: 'patch object required.' }, { status: 400 });
  }
  const rawPatch = body.patch as Record<string, unknown>;

  // Build a sanitized patch — drop anything not in EDITABLE_FIELDS and
  // validate enum-ish values.
  const safePatch: Record<string, unknown> = {};
  for (const k of Object.keys(rawPatch)) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    let v = rawPatch[k];
    if (k === 'status') {
      if (typeof v !== 'string' || !ALLOWED_STATUSES.has(v)) continue;
    }
    if (k.startsWith('sell_')) {
      if (typeof v !== 'boolean') continue;
    }
    if (['name','category','unit_of_measure','pack_size','image_url'].includes(k)) {
      if (v === null) {
        // null clears optional fields
      } else if (typeof v !== 'string') {
        continue;
      } else {
        v = v.trim();
        if (v === '' && k !== 'name') v = null; // empty → null for non-required strings
      }
    }
    safePatch[k] = v;
  }

  // cost_per_unit is special — comes outside EDITABLE_FIELDS and triggers
  // a product_costs INSERT instead of a direct UPDATE.
  const costRaw  = rawPatch.cost_per_unit;
  const newCost  = typeof costRaw === 'number' && Number.isFinite(costRaw) && costRaw > 0 ? costRaw : null;

  if (Object.keys(safePatch).length === 0 && newCost == null) {
    return NextResponse.json({ ok: false, error: 'No editable fields in patch.' }, { status: 400 });
  }

  // Resolve caller's supplier_id.
  const { data: supplierRow, error: supErr } = await admin
    .from('suppliers').select('id, name').eq('portal_user_id', caller.userId).maybeSingle();
  if (supErr || !supplierRow) {
    return NextResponse.json({
      ok: false,
      error: 'No supplier record linked to your account. Ask Dedrick to link your portal_user_id on the suppliers table.',
    }, { status: 404 });
  }
  const supplierId = (supplierRow as { id: string }).id;

  // Ownership gate.
  const { data: prod, error: pErr } = await admin
    .from('products')
    .select('id, sku, primary_supplier_id, unit_of_measure')
    .eq('id', productId)
    .maybeSingle();
  if (pErr || !prod) return NextResponse.json({ ok: false, error: 'Product not found.' }, { status: 404 });
  if ((prod as { primary_supplier_id: string | null }).primary_supplier_id !== supplierId) {
    return NextResponse.json({ ok: false, error: 'You do not own this product.' }, { status: 403 });
  }

  // Apply the editable-fields patch first.
  if (Object.keys(safePatch).length > 0) {
    const { error: uErr } = await admin.from('products').update(safePatch).eq('id', productId);
    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  // Then handle cost change — INSERT a new product_costs row.
  if (newCost != null) {
    const unit = (prod as { unit_of_measure: string | null }).unit_of_measure ?? 'each';
    const { error: cErr } = await admin.from('product_costs').insert({
      product_id:       productId,
      supplier_id:      supplierId,
      cost_type:        'opening_balance',
      cost_per_unit:    newCost,
      unit_of_measure:  unit,
      shipping_per_lb:  0,
      customs_duty_pct: 0,
      vat_levy_pct:     0,
      processing_fee:   0,
      effective_from:   new Date().toISOString(),
      is_current:       true,
      recorded_by:      caller.userId,
    });
    if (cErr) return NextResponse.json({ ok: false, error: `Cost update failed: ${cErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
