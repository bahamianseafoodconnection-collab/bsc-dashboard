// =====================================================================
// /api/phone-orders/[id]/collect  (G5 — close the phone-order loop)
//
// After the founder approves a phone order, the cashier collects payment
// (COD cash, or card/wire/check) and closes it here: flips the order to
// paid + Confirmed and records the sale financials via the SAME helper
// the POS/reconcile paths use (recordSaleFinancials) — so revenue/profit
// land consistently. True credit ("bill to account, pay later") is the
// founder credit lane (G6), not this cash-collection action.
//
//   POST { method: 'cash'|'card'|'wire'|'check', notes? }
//
// Cashier / andros_staff / manager / founder / co_founder / control_admin.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CHANNEL_MARGIN, VAT_RATE, recordSaleFinancials, type PricingChannel } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['cashier', 'andros_staff', 'manager', 'founder', 'co_founder', 'control_admin']);
const METHODS = new Set(['cash', 'card', 'wire', 'check']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot collect payment.` }, { status: 403 });

  const { id: orderId } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const method = METHODS.has(String(body.method)) ? String(body.method) : 'cash';
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: ord } = await admin.from('orders')
    .select('id, total, status, order_type, payment_status, channel').eq('id', orderId).maybeSingle();
  if (!ord) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  const o = ord as { total: number | null; status: string | null; order_type: string | null; payment_status: string | null; channel: string | null };
  if (o.order_type !== 'phone_order') return NextResponse.json({ ok: false, error: 'Not a phone order' }, { status: 400 });
  if (o.status === 'pending_approval') return NextResponse.json({ ok: false, error: 'Order is still awaiting founder approval' }, { status: 409 });
  if ((o.payment_status ?? '').toLowerCase() === 'paid') return NextResponse.json({ ok: true, already: true });

  // Atomic flip — only if not already paid.
  const nowIso = new Date().toISOString();
  const { data: upd, error } = await admin.from('orders').update({
    payment_status: 'paid',
    payment_method: method,
    payment_received_at: nowIso,
    payment_received_by: user.id,
    payment_received_method: method,
    payment_received_notes: notes,
    status: 'Confirmed',
  }).eq('id', orderId).neq('payment_status', 'paid').select('id');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!upd || upd.length === 0) return NextResponse.json({ ok: true, already: true });

  // Record revenue/profit with the same helper as POS/reconcile. Phone orders
  // are remote sales → online_market basis (parity with the reconcile path).
  try {
    const total = Number(o.total ?? 0);
    if (total > 0) {
      const channel: PricingChannel = (o.channel && (o.channel in CHANNEL_MARGIN)) ? (o.channel as PricingChannel) : 'online_market';
      const toCost = 1 / ((1 + CHANNEL_MARGIN[channel]) * (1 + VAT_RATE));
      await recordSaleFinancials({ saleAmount: total, costBasis: total * toCost, channel, orderId });
    }
  } catch (e) {
    console.warn('[phone-order collect] financials log failed:', e);
  }

  return NextResponse.json({ ok: true, paid: true, method });
}
