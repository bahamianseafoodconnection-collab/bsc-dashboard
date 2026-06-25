// /api/founder/wholesale/list
//
// List case product(s) on the Wholesale Online Market — sets sell_wholesale=true
// (the ensure_channel_prices trigger fills the local_wholesale price when a cost
// exists). { product_id } for one, { all:true } for every active case product.
// Unlist with { product_id, unlist:true }. Founder-only, service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const unitsFromPack = (pack: string | null): number | null => {
  const m = String(pack ?? '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

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
  if (!role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only.' }, { status: 403 });

  let b: { product_id?: unknown; all?: unknown; unlist?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (b.all === true) {
    // Every active case product (units_per_case>1 OR a pack count) onto wholesale.
    const { data: prods } = await admin.from('products').select('id, units_per_case, pack_size').eq('status', 'active').eq('sell_online', true);
    const ids = ((prods ?? []) as Array<{ id: string; units_per_case: number | null; pack_size: string | null }>)
      .filter(p => (p.units_per_case && p.units_per_case > 1) || (unitsFromPack(p.pack_size) ?? 0) > 1)
      .map(p => p.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, listed: 0 });
    let listed = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await admin.from('products').update({ sell_wholesale: true }).in('id', ids.slice(i, i + 100));
      if (!error) listed += Math.min(100, ids.length - i);
    }
    try { await admin.from('ai_writes').insert({ tool: 'wholesale_list_all', caller_id: user.id, input: { count: ids.length }, result: { listed }, status: 'success', error: null }); } catch { /* non-fatal */ }
    return NextResponse.json({ ok: true, listed });
  }

  const productId = typeof b.product_id === 'string' ? b.product_id : '';
  if (!productId) return NextResponse.json({ ok: false, error: 'product_id or all required' }, { status: 400 });
  const { error } = await admin.from('products').update({ sell_wholesale: b.unlist !== true }).eq('id', productId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, on_wholesale: b.unlist !== true });
}
