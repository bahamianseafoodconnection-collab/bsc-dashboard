// /api/admin/products/bulk
//
// Bulk update endpoint for the /admin/inventory spreadsheet's
// multi-select actions. Takes an array of product_ids + the same
// patch body shape as /api/admin/products/[id]. Applies the patch
// to every id in one UPDATE statement.
//
// Currently used for:
//   - Bulk archive       (status='archived' + clear all sell_* flags)
//   - Bulk channel flip  (sell_X = true|false on N products)
//
// Cost edit (single-product) stays at the per-id endpoint because it
// triggers price recalc per-row and we want atomicity per product.
//
// Auth: founder / co_founder / manager / control_admin / basic_admin.
// Excludes cashier (no catalog rewrite).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'founder', 'co_founder', 'manager',
  'control_admin', 'basic_admin',
]);

const BULK_FIELDS = new Set([
  'status',
  'sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale',
  'is_featured', 'low_stock_threshold',
]);

interface BulkBody {
  ids?:   unknown;
  patch?: unknown;
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
    return NextResponse.json(
      { ok: false, error: `Role "${role ?? 'none'}" cannot bulk-edit products.` },
      { status: 403 },
    );
  }

  let body: BulkBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const ids   = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
  const patch = (body.patch && typeof body.patch === 'object') ? body.patch as Record<string, unknown> : {};

  if (ids.length === 0)  return NextResponse.json({ ok: false, error: 'ids array required + non-empty' }, { status: 400 });
  if (ids.length > 500)  return NextResponse.json({ ok: false, error: `Batch too large (${ids.length}). Max 500.` }, { status: 400 });

  // Filter patch to only allowed bulk fields
  const cleanPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (BULK_FIELDS.has(k)) cleanPatch[k] = v;
  }
  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ ok: false, error: 'No bulk-editable fields in patch' }, { status: 400 });
  }

  // Special case: status='archived' should also clear all sell_* flags
  // (anti-leak — archived products must never accidentally render anywhere)
  if (cleanPatch.status === 'archived') {
    cleanPatch.sell_nassau    = false;
    cleanPatch.sell_andros    = false;
    cleanPatch.sell_online    = false;
    cleanPatch.sell_wholesale = false;
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin
    .from('products')
    .update(cleanPatch)
    .in('id', ids)
    .select('id');

  if (error) {
    return NextResponse.json({ ok: false, error: `Bulk update failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updated_count:  data?.length ?? 0,
    updated_fields: Object.keys(cleanPatch),
  });
}
