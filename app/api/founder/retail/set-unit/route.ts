// /api/founder/retail/set-unit
//
// Make a Retail Online Market product sell PER ITEM (individual units from a
// case): sets unit_of_measure='each' so the storefront sells units, and records
// units_per_case for cost/reorder. Does NOT change pricing math — the per-unit
// online price comes from the existing cost system (set via Receive Cases).
// Founder/supplier-handler/manager. Service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'manager', 'supplier_handler']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: 'Founder / handler only.' }, { status: 403 });

  let b: { product_id?: unknown; units_per_case?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const productId = typeof b.product_id === 'string' ? b.product_id : '';
  const upc = b.units_per_case != null ? Math.floor(Number(b.units_per_case)) : null;
  if (!productId) return NextResponse.json({ ok: false, error: 'product_id required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const update: Record<string, unknown> = { unit_of_measure: 'each' };
  if (upc && upc > 0) update.units_per_case = upc;
  const { error } = await admin.from('products').update(update).eq('id', productId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  try { await admin.from('ai_writes').insert({ tool: 'retail_set_unit', caller_id: user.id, input: { product_id: productId, units_per_case: upc }, result: { unit_of_measure: 'each' }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true });
}
