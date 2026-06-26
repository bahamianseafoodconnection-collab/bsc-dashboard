// /api/supplier-handler/set-channel
//
// Send a product LIVE on a channel — the per-product "live trigger" for Supplier
// Handlers (assigned users), not just founder/managers. Least privilege: only
// flips a sell_* flag (+ promotes status to 'active' when going live). Cannot
// touch cost/pricing/delete (that stays on the admin-products route).
//
// Body: { product_id, channel: 'sell_nassau'|'sell_andros'|'sell_online'|'sell_wholesale', value: boolean, status?: 'active' }
// Service-role. Allowed: supplier_handler + managers + founders.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['supplier_handler', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin', 'basic_admin']);
const CHANNEL_FLAGS = new Set(['sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale', 'sell_nassau_wholesale', 'sell_andros_wholesale']);

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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot change product channels.` }, { status: 403 });

  let b: { product_id?: unknown; channel?: unknown; value?: unknown; status?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const productId = typeof b.product_id === 'string' ? b.product_id : '';
  const channel = typeof b.channel === 'string' ? b.channel : '';
  if (!productId || !CHANNEL_FLAGS.has(channel)) return NextResponse.json({ ok: false, error: 'product_id + valid channel required' }, { status: 400 });
  const value = b.value === true;

  const update: Record<string, unknown> = { [channel]: value };
  // Going live promotes to 'active'; never writes a bogus status.
  if (b.status === 'active') update.status = 'active';

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.from('products').update(update).eq('id', productId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  try { await admin.from('ai_writes').insert({ tool: 'supplier_handler_set_channel', caller_id: user.id, input: { product_id: productId, channel, value }, result: { ...update }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true });
}
