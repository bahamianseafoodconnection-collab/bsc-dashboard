// =====================================================================
// /api/spinytails/orders  (G19 — orders destined for Spiny Tail)
//
// Consolidated, cross-channel view of orders the processor must assemble:
// phone / online / Nassau POS. A "Spiny Tail order" = an active order with
// at least one in-house-processed (is_bsc_processed) line — lobster/conch
// that the plant pulls from the freezer, processes, and packs.
//
//   GET → { ok, orders: [{ id, channel, customer_name, status,
//           payment_status, created_at, total, payment_ref, items:[{name,qty}] }] }
//
// Processing staff only. Service-role (orders are RLS-locked).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'manager', 'supervisor', 'processor', 'operations', 'qc_staff', 'receiver']);
const DONE = new Set(['cancelled', 'delivered', 'shipped', 'refunded', 'void']);

function channelLabel(orderType: string | null, channel: string | null): string {
  if (orderType === 'phone_order') return 'Phone';
  const c = (channel || '').toLowerCase();
  if (c.includes('nassau_pos') || (orderType || '').includes('pos_sale_nassau')) return 'Nassau POS';
  if (c.includes('andros')) return 'Andros POS';
  if (c.includes('online')) return 'Online';
  return channel || orderType || 'Other';
}

function parseLines(raw: unknown): Array<Record<string, unknown>> {
  let arr: unknown = raw;
  if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(arr) ? arr as Array<Record<string, unknown>> : [];
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: 'Processing staff only' }, { status: 403 });

  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  const since = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
  const { data: rows } = await admin.from('orders')
    .select('id, created_at, order_type, channel, customer_name, status, payment_status, items, wholesale_items, total, payment_ref')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(400);

  const orders = (rows ?? []) as Array<{ id: string; created_at: string; order_type: string | null; channel: string | null; customer_name: string | null; status: string | null; payment_status: string | null; items: unknown; wholesale_items: unknown; total: number | null; payment_ref: string | null }>;

  // Collect lines + product ids to resolve is_bsc_processed for unstamped lines.
  type Pre = { o: typeof orders[number]; lines: Array<Record<string, unknown>> };
  const pre: Pre[] = [];
  const productIds = new Set<string>();
  for (const o of orders) {
    if (DONE.has((o.status || '').toLowerCase())) continue;
    const lines = [...parseLines(o.items), ...parseLines(o.wholesale_items)];
    if (lines.length === 0) continue;
    for (const l of lines) { const pid = l.product_id; if (typeof pid === 'string') productIds.add(pid); }
    pre.push({ o, lines });
  }

  const processedById = new Map<string, boolean>();
  if (productIds.size > 0) {
    const { data: prods } = await admin.from('products').select('id, is_bsc_processed').in('id', [...productIds]);
    for (const p of (prods ?? []) as { id: string; is_bsc_processed: boolean | null }[]) processedById.set(p.id, !!p.is_bsc_processed);
  }

  const result = [];
  for (const { o, lines } of pre) {
    const spinyLines = lines.filter((l) => l.is_bsc_processed === true || (typeof l.product_id === 'string' && processedById.get(l.product_id)));
    if (spinyLines.length === 0) continue;
    result.push({
      id: o.id,
      channel: channelLabel(o.order_type, o.channel),
      customer_name: o.customer_name,
      status: o.status,
      payment_status: o.payment_status,
      created_at: o.created_at,
      total: o.total,
      payment_ref: o.payment_ref,
      items: spinyLines.map((l) => ({ name: String(l.name ?? l.sku ?? 'Item'), qty: Number(l.quantity ?? l.qty ?? 0), unit: typeof l.unit === 'string' ? l.unit : null })),
    });
  }

  return NextResponse.json({ ok: true, orders: result });
}
