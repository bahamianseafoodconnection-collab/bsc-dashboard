// /api/supplier-handler/set-photo
//
// Set a product's marketplace photo. The client crops/resizes to a square JPEG
// and posts base64; this uploads it to the site-images bucket (service-role, so
// it works regardless of storage RLS) and sets products.image_url. Least
// privilege: ONLY touches image_url — supplier_handler can't reach the broader
// /api/admin/products route.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = new Set(['supplier_handler', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin', 'basic_admin']);

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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot set product photos.` }, { status: 403 });

  let b: { product_id?: unknown; image_base64?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const productId = typeof b.product_id === 'string' ? b.product_id : '';
  const b64 = typeof b.image_base64 === 'string' ? b.image_base64.replace(/^data:[^,]+,/, '') : '';
  if (!productId || !b64) return NextResponse.json({ ok: false, error: 'product_id and image_base64 required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: prod } = await admin.from('products').select('id, sku').eq('id', productId).maybeSingle<{ id: string; sku: string | null }>();
  if (!prod) return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404 });

  let bytes: Buffer;
  try { bytes = Buffer.from(b64, 'base64'); } catch { return NextResponse.json({ ok: false, error: 'Bad image data' }, { status: 400 }); }
  if (bytes.length > 6_000_000) return NextResponse.json({ ok: false, error: 'Image too large (max ~6MB)' }, { status: 413 });

  const safeSku = (prod.sku || prod.id).replace(/[^A-Za-z0-9_-]/g, '');
  const path = `products/${safeSku}-${Date.now()}.jpg`;
  const { error: upErr } = await admin.storage.from('site-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 });
  const url = admin.storage.from('site-images').getPublicUrl(path).data.publicUrl;

  const { error: updErr } = await admin.from('products').update({ image_url: url }).eq('id', prod.id);
  if (updErr) return NextResponse.json({ ok: false, error: `Saved image but failed to link: ${updErr.message}` }, { status: 500 });

  try { await admin.from('ai_writes').insert({ tool: 'supplier_handler_set_photo', caller_id: user.id, input: { product_id: productId }, result: { url }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, image_url: url });
}
