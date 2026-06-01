// /api/supplier-portal/toggle-product
//
// Lets a supplier pause or resume their own product listing without
// going through the founder dashboard. Common case: fisherman runs out
// of conch mid-day and needs to stop new orders before the next catch
// lands. Phase 2 of Task #87.
//
// Auth: 'supplier' or 'partner_us' role.
// Scope: caller can only toggle products where products.primary_supplier_id
//        matches the suppliers.id linked to their portal_user_id.
// Service-role on the write so RLS doesn't block the supplier (their
// session doesn't have UPDATE on products).
//
// Body:
//   { product_id: UUID, enable: boolean }
//
// On enable: sets sell_online=true (the channel suppliers actually
// participate in via /market). nassau / andros / wholesale flags are
// left untouched — those are founder-controlled distribution decisions.
// On disable: clears all four sell_* flags so the listing disappears
// from every channel immediately.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['supplier', 'partner_us']);

interface Body {
  product_id?: unknown;
  enable?:     unknown;
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveCaller(req: NextRequest): Promise<{
  userId: string | null;
  role:   string | null;
  isSupplier: boolean;
}> {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const header = req.headers.get('authorization') ?? '';
  if (!url || !anon || !header.startsWith('Bearer ')) {
    return { userId: null, role: null, isSupplier: false };
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
  if (!caller.userId) return NextResponse.json({ ok: false, error: 'Sign-in required.' },     { status: 401 });
  if (!caller.isSupplier) return NextResponse.json({ ok: false, error: 'Supplier role required.' }, { status: 403 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  const enable    = body.enable === true;
  if (!productId) return NextResponse.json({ ok: false, error: 'product_id required.' }, { status: 400 });

  // Resolve the caller's own supplier_id. Both 'supplier' and 'partner_us'
  // roles link to a suppliers row via portal_user_id.
  const { data: supplierRow, error: supErr } = await admin
    .from('suppliers')
    .select('id, name')
    .eq('portal_user_id', caller.userId)
    .maybeSingle();
  if (supErr || !supplierRow) {
    return NextResponse.json({
      ok: false,
      error: 'No supplier record linked to your account. Ask Dedrick to link your portal_user_id on the suppliers table.',
    }, { status: 404 });
  }
  const supplierId = (supplierRow as { id: string }).id;

  // Ownership gate — the product must belong to this supplier.
  const { data: productRow, error: pErr } = await admin
    .from('products')
    .select('id, sku, primary_supplier_id, sell_nassau, sell_andros, sell_online, sell_wholesale')
    .eq('id', productId)
    .maybeSingle();
  if (pErr || !productRow) return NextResponse.json({ ok: false, error: 'Product not found.' }, { status: 404 });
  if ((productRow as { primary_supplier_id: string | null }).primary_supplier_id !== supplierId) {
    return NextResponse.json({
      ok: false,
      error: 'You do not own this product — only the supplier listed as primary can toggle it.',
    }, { status: 403 });
  }

  // Flip the flags. Disable = clear all four; Enable = set sell_online=true
  // (suppliers participate in /market by default). Cross-channel distribution
  // stays a founder decision so we don't unintentionally publish to Andros etc.
  const patch = enable
    ? { sell_online: true }
    : { sell_nassau: false, sell_andros: false, sell_online: false, sell_wholesale: false };

  const { data: updated, error: uErr } = await admin
    .from('products')
    .update(patch)
    .eq('id', productId)
    .select('id, sku, sell_nassau, sell_andros, sell_online, sell_wholesale')
    .single();
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, product: updated });
}
