// /api/rbc/portal
//
// RBC Payment Confirmation Portal data (GET) + manual match (POST). Founder/admin.
// GET → summary, recent reports, auto-matched, unmatched (with suggested orders).
// POST { txn_id, order_id } → manually confirm a line against an order (recover
// pending → paid); { txn_id, unmatch:true } → clear a match.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);
const PENDING = ['payment_pending', 'pending', 'unpaid'];

async function gate(req: NextRequest): Promise<{ ok: true; admin: SupabaseClient; userId: string } | { ok: false; status: number; error: string }> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return { ok: false, status: 500, error: 'Supabase not configured' };
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Sign in required' };
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: 'Invalid session' };
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return { ok: false, status: 403, error: 'Founder / admin only.' };
  return { ok: true, admin: createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin } = g;

  const [{ data: reports }, { data: txns }] = await Promise.all([
    admin.from('rbc_reports').select('*').order('created_at', { ascending: false }).limit(30),
    admin.from('rbc_transactions').select('*').order('txn_date', { ascending: false }).limit(500),
  ]);
  const allTxns = (txns ?? []) as Array<Record<string, unknown>>;
  const matched = allTxns.filter(t => t.matched);
  const unmatched = allTxns.filter(t => !t.matched);

  // Candidate orders for unmatched lines: POS register card sales, matched by
  // amount (this RBC report is the in-store POS terminal). Empty until BSC starts
  // recording POS Nassau sales — then suggestions/auto-match light up.
  const { data: pend } = await admin.from('orders')
    .select('id, total, created_at, customer_name, channel')
    .in('channel', ['nassau_pos', 'andros_pos'])
    .in('payment_method', ['card', 'split'])
    .order('created_at', { ascending: false }).limit(600);
  const pendingOrders = (pend ?? []) as Array<{ id: string; total: number | null; created_at: string; customer_name: string | null; channel: string | null }>;

  // Daily card-settlement summary (income view straight from the RBC reports —
  // valuable now even before order-matching is active).
  const dayMap = new Map<string, { count: number; gross: number; fees: number }>();
  const cardMap = new Map<string, { count: number; gross: number }>();
  let tGross = 0, tFees = 0;
  for (const t of allTxns) {
    const amt = Number(t.amount) || 0, fee = Number(t.fee) || 0;
    const day = String(t.txn_date ?? 'unknown').slice(0, 10);
    const e = dayMap.get(day) ?? { count: 0, gross: 0, fees: 0 };
    e.count++; e.gross += amt; e.fees += fee; dayMap.set(day, e);
    const ct = String(t.card_type ?? '—');
    const c = cardMap.get(ct) ?? { count: 0, gross: 0 };
    c.count++; c.gross += amt; cardMap.set(ct, c);
    tGross += amt; tFees += fee;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const settlements = {
    days: [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, v]) => ({ date, count: v.count, gross: r2(v.gross), fees: r2(v.fees), net: r2(v.gross - v.fees) })),
    by_card_type: [...cardMap.entries()].sort((a, b) => b[1].gross - a[1].gross)
      .map(([card_type, v]) => ({ card_type, count: v.count, gross: r2(v.gross) })),
    totals: { count: allTxns.length, gross: r2(tGross), fees: r2(tFees), net: r2(tGross - tFees) },
  };
  const unmatchedOut = unmatched.slice(0, 80).map(t => {
    const amt = Number(t.amount) || 0;
    const suggestions = pendingOrders.filter(o => Math.abs((Number(o.total) || 0) - amt) <= 0.01)
      .slice(0, 4).map(o => ({ id: o.id, total: o.total, created_at: o.created_at, customer_name: o.customer_name, channel: o.channel }));
    return { ...t, suggestions };
  });

  // Order info for matched lines (for the audit/auto-matched view)
  const matchedIds = [...new Set(matched.map(t => t.matched_order_id).filter(Boolean))] as string[];
  const orderMap: Record<string, { customer_name: string | null; payment_status: string | null }> = {};
  if (matchedIds.length) {
    const { data: ords } = await admin.from('orders').select('id, customer_name, payment_status').in('id', matchedIds);
    for (const o of (ords ?? []) as Array<{ id: string; customer_name: string | null; payment_status: string | null }>) orderMap[o.id] = { customer_name: o.customer_name, payment_status: o.payment_status };
  }

  const confirmedAmount = matched.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Automatic-ingestion setup status (the founder copies endpoint+token into the
  // Gmail Apps Script / inbound provider).
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'www.bscbahamas.com';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const token = process.env.RBC_INBOUND_TOKEN || null;
  const reportRows = (reports ?? []) as Array<{ source?: string; created_at?: string }>;
  const lastEmail = reportRows.find(r => r.source === 'email')?.created_at ?? null;
  const inbound = {
    active: !!token,
    endpoint: `${proto}://${host}/api/rbc/inbound`,
    token,
    last_email_report_at: lastEmail,
    status: !token ? 'not_connected' : lastEmail ? 'auto_active' : 'waiting_for_first_email',
  };

  return NextResponse.json({
    ok: true,
    inbound,
    settlements,
    summary: { reports: (reports ?? []).length, transactions: allTxns.length, matched: matched.length, unmatched: unmatched.length, confirmed_amount: Math.round(confirmedAmount * 100) / 100 },
    reports: reports ?? [],
    matched: matched.slice(0, 60).map(t => ({ ...t, order: t.matched_order_id ? orderMap[t.matched_order_id as string] ?? null : null })),
    unmatched: unmatchedOut,
  });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin } = g;
  let b: { txn_id?: unknown; order_id?: unknown; unmatch?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const txnId = typeof b.txn_id === 'string' ? b.txn_id : '';
  if (!txnId) return NextResponse.json({ ok: false, error: 'txn_id required' }, { status: 400 });

  if (b.unmatch === true) {
    const { error } = await admin.from('rbc_transactions').update({ matched: false, matched_order_id: null, match_method: null, confirmed_at: null }).eq('id', txnId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const orderId = typeof b.order_id === 'string' ? b.order_id : '';
  if (!orderId) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });
  const { data: ord } = await admin.from('orders').select('id, payment_status').eq('id', orderId).maybeSingle<{ id: string; payment_status: string | null }>();
  if (!ord) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });

  let recovered = false;
  if (ord.payment_status && PENDING.includes(ord.payment_status)) {
    const { data: flip } = await admin.from('orders').update({ payment_status: 'paid', payment_method: 'card' }).eq('id', ord.id).in('payment_status', PENDING).select('id');
    recovered = !!(flip && flip.length);
  }
  const { error } = await admin.from('rbc_transactions').update({ matched: true, matched_order_id: ord.id, match_method: 'manual', confirmed_at: new Date().toISOString() }).eq('id', txnId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  try { await admin.from('ai_writes').insert({ tool: 'rbc_manual_match', caller_id: g.userId, input: { txn_id: txnId, order_id: orderId }, result: { recovered }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, recovered });
}
