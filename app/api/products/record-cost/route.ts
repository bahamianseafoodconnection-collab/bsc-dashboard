// /api/products/record-cost
//
// Server-authoritative cost receipt (Phase 5 batch 7). Replaces the
// browser→RLS-direct product_costs.insert() on app/intake/scan-invoice.
//
// INSERTs a new product_costs row (cost_type='opening_balance' — the only
// seeded enum value per the product_costs enum memory; costs_expire_previous
// flips the prior is_current row). Costs are immutable: we INSERT, never
// UPDATE. The recalc_channel_prices_on_purchase trigger then re-prices each
// channel from its STORED margin_multiplier — which is why every price write
// in this batch persists margin_multiplier.
//
// Body: { product_id, supplier_id?, cost_per_unit, unit_of_measure?, notes? }
// Resp: { ok, id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

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
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot record costs.` }, { status: 403 });
  }

  let b: { product_id?: unknown; supplier_id?: unknown; cost_per_unit?: unknown; unit_of_measure?: unknown; notes?: unknown };
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const productId = typeof b.product_id === 'string' ? b.product_id : '';
  const cost = typeof b.cost_per_unit === 'number' && Number.isFinite(b.cost_per_unit) ? b.cost_per_unit : NaN;
  if (!productId) return NextResponse.json({ ok: false, error: 'product_id is required' }, { status: 400 });
  if (!(cost > 0)) return NextResponse.json({ ok: false, error: 'cost_per_unit must be greater than zero' }, { status: 400 });
  if (cost > 100000) return NextResponse.json({ ok: false, error: 'cost_per_unit looks too large (sanity check)' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let newId: string | null = null;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('product_costs').insert({
      product_id:       productId,
      supplier_id:      typeof b.supplier_id === 'string' && b.supplier_id ? b.supplier_id : null,
      cost_type:        'opening_balance',
      cost_per_unit:    cost,
      unit_of_measure:  typeof b.unit_of_measure === 'string' && b.unit_of_measure ? b.unit_of_measure : 'each',
      shipping_per_lb:  0,
      customs_duty_pct: 0,
      vat_levy_pct:     0,
      processing_fee:   0,
      effective_from:   new Date().toISOString(),
      is_current:       true,
      recorded_by:      user.id,
      notes:            typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
    }).select('id').single();
    if (error) err = error.message; else newId = (data as { id: string }).id;
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'products_record_cost',
      caller_id: user.id,
      input:     { product_id: productId, cost_per_unit: cost },
      result:    { id: newId, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Could not record cost: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: newId });
}
