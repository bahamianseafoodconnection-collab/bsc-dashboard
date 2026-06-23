// /api/supplier-handler/dashboard
//
// Live "Things to do today" counts + summary for the Supplier Handler dashboard
// (the electronic-handbook home for the staff member who manages suppliers,
// pricelists, product extraction, availability, and photos).
//
// Server-authoritative: Bearer token → profiles.role gate → service-role client
// (bypasses RLS for accurate counts). Every count is independent + defensive —
// returns null on any error so one bad query never crashes the dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['supplier_handler', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin']);

async function safeCount(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  const fullName = (prof as { full_name?: string | null } | null)?.full_name ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" has no supplier-handler dashboard.` }, { status: 403 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const S = () => admin.from('suppliers').select('id', { count: 'exact', head: true });
  const P = () => admin.from('products').select('id', { count: 'exact', head: true });

  // Suppliers with a pricelist uploaded but no products extracted yet.
  let awaitingExtraction: number | null = null;
  try {
    const [{ data: withList }, { data: withProducts }] = await Promise.all([
      admin.from('suppliers').select('id').not('pricelist_url', 'is', null),
      admin.from('products').select('primary_supplier_id').not('primary_supplier_id', 'is', null),
    ]);
    const have = new Set((withProducts ?? []).map((r: { primary_supplier_id: string }) => r.primary_supplier_id));
    awaitingExtraction = (withList ?? []).filter((s: { id: string }) => !have.has(s.id)).length;
  } catch { awaitingExtraction = null; }

  const [
    newSuppliers, pricelistsMissing, productsPendingApproval,
    productsMissingPhotos, productsOffAllChannels, activeSuppliers, liveProducts,
  ] = await Promise.all([
    // Suppliers not yet activated (need review/classification).
    safeCount(S().eq('is_active', false)),
    // Active suppliers with no pricelist on file.
    safeCount(S().eq('is_active', true).is('pricelist_url', null)),
    // Products waiting to be approved/activated.
    safeCount(P().in('status', ['draft', 'pending_approval'])),
    // Active products with no photo (can't show online without one).
    safeCount(P().eq('status', 'active').is('image_url', null)),
    // Active products switched OFF in every channel (out of stock / unavailable).
    safeCount(P().eq('status', 'active').eq('sell_nassau', false).eq('sell_andros', false).eq('sell_online', false).eq('sell_wholesale', false)),
    // Summary
    safeCount(S().eq('is_active', true)),
    safeCount(P().eq('status', 'active').or('sell_nassau.eq.true,sell_andros.eq.true,sell_online.eq.true,sell_wholesale.eq.true')),
  ]);

  return NextResponse.json({
    ok: true,
    handler: { id: user.id, name: fullName, role },
    today: {
      new_suppliers:             newSuppliers,
      pricelists_missing:        pricelistsMissing,
      products_awaiting_extraction: awaitingExtraction,
      products_pending_approval: productsPendingApproval,
      products_missing_photos:   productsMissingPhotos,
      products_off_all_channels: productsOffAllChannels,
    },
    summary: {
      active_suppliers: activeSuppliers,
      live_products:    liveProducts,
    },
  });
}
