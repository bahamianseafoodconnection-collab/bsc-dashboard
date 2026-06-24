// /api/supplier-handler/products
//
// Catalogue list for the Supplier Handler "Product Photos" workspace: products
// with photo status, supplier, category, channel flags, approval status.
// Products missing a photo sort first. Founder/manager/supplier_handler.
// Service-role read (accurate regardless of RLS).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['supplier_handler', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin', 'basic_admin']);

export async function GET(req: NextRequest) {
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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot manage product photos.` }, { status: 403 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.from('products')
    .select('id, name, sku, category, image_url, status, sell_nassau, sell_andros, sell_online, sell_wholesale, primary_supplier_id')
    .eq('status', 'active')
    .order('name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown>>;

  const supIds = [...new Set(rows.map(r => r.primary_supplier_id).filter(Boolean))] as string[];
  const supMap: Record<string, string> = {};
  if (supIds.length) {
    const { data: sups } = await admin.from('suppliers').select('id, name').in('id', supIds);
    for (const s of (sups ?? []) as Array<{ id: string; name: string }>) supMap[s.id] = s.name;
  }

  const products = rows.map(r => ({
    id: r.id, name: r.name, sku: r.sku, category: r.category,
    image_url: r.image_url, has_photo: !!r.image_url,
    supplier: r.primary_supplier_id ? (supMap[r.primary_supplier_id as string] ?? null) : null,
    sell_nassau: r.sell_nassau, sell_andros: r.sell_andros, sell_online: r.sell_online, sell_wholesale: r.sell_wholesale,
  }));
  // Missing photos first, then by name.
  products.sort((a, b) => (a.has_photo === b.has_photo ? 0 : a.has_photo ? 1 : -1));

  return NextResponse.json({ ok: true, products, missing: products.filter(p => !p.has_photo).length, total: products.length });
}
