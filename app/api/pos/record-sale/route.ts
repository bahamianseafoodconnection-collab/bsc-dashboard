// /api/pos/record-sale
//
// Server-authoritative POS counter sale (Phase 5 batch 6c) for the LIVE
// registers — /pos (Nassau) and /pos-andros. Replaces the browser→RLS-direct
// orders.insert in those pages.
//
// Unlike the online counter path (/api/orders/place sale_mode:'counter'), a
// register sale carries bespoke fields that MUST be preserved exactly so live
// accounting + drawer reconciliation don't break: split-payment breakdown,
// terminal_type, card_ref, cashier_session linkage, and the account-credit
// (unpaid) variant. This route is a FAITHFUL move of the existing insert —
// same fields, same behavior — with the integrity-critical bits forced
// server-side:
//   • payment_status: 'account' → 'unpaid', else 'paid_in_full' (never trust client)
//   • status: 'completed'
//   • cashier_user_id / user_id: the verified session user (not client-claimed)
//   • profit split: RECOMPUTED via computeProfitSplit with the server-chosen
//     channel margin (client cannot forge net_profit → no points-minting vector)
//
// Body: { channel: 'nassau_pos'|'andros_pos', expense_rate?, order: {…fields…} }
// Resp: { ok, order_id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeProfitSplit, fetchOverheadMetrics, NASSAU_POS_MARGIN, ANDROS_POS_MARGIN } from '@/lib/profit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set([
  'cashier', 'andros_staff', 'manager',
  'founder', 'co_founder', 'control_admin', 'basic_admin',
]);

// Columns a register sale may set. Anything else in `order` is ignored (no
// arbitrary column injection). status / payment_status / cashier identity /
// profit columns are forced below, never taken from the client.
const ALLOWED = new Set([
  'order_type', 'location', 'channel', 'wholesaler',
  'wholesale_items', 'wholesale_cost_total', 'subtotal', 'vat_amount', 'total',
  'payment_method', 'payment_breakdown', 'terminal_type', 'card_ref',
  'admin_notes', 'customer_id', 'customer_name', 'customer_phone',
  'cashier_session_id',
]);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required to ring a sale.' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session — sign in again.' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !STAFF_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot ring a register sale.` }, { status: 403 });
  }

  let body: { channel?: unknown; expense_rate?: unknown; order?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const channel = body.channel === 'andros_pos' ? 'andros_pos' : body.channel === 'nassau_pos' ? 'nassau_pos' : '';
  if (!channel) return NextResponse.json({ ok: false, error: "channel must be 'nassau_pos' or 'andros_pos'" }, { status: 400 });
  const orderIn = (body.order && typeof body.order === 'object') ? body.order as Record<string, unknown> : null;
  if (!orderIn) return NextResponse.json({ ok: false, error: 'order payload required' }, { status: 400 });

  // Whitelist incoming fields.
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(orderIn)) {
    if (ALLOWED.has(k)) row[k] = v;
  }

  const total = Number(row.total);
  if (!Number.isFinite(total) || total < 0) {
    return NextResponse.json({ ok: false, error: 'Invalid sale total' }, { status: 400 });
  }
  const hasItems = Array.isArray(row.wholesale_items) && (row.wholesale_items as unknown[]).length > 0;
  if (!hasItems) return NextResponse.json({ ok: false, error: 'No items in sale' }, { status: 400 });

  // ── Forced server-side fields (never trust the client for these) ──────
  const payMethod = String(row.payment_method ?? 'cash');
  row.status = 'completed';
  row.payment_status = payMethod === 'account' ? 'unpaid' : 'paid_in_full';
  row.cashier_user_id = user.id; // orders has NO user_id column — cashier_user_id is the linkage

  // Profit split recomputed server-side with the server-chosen channel margin.
  // expense_rate is a benign session metric (same for every sale that shift);
  // the SPLIT (net_profit etc.) is computed here so it can't be client-forged.
  const margin = channel === 'andros_pos' ? ANDROS_POS_MARGIN : NASSAU_POS_MARGIN;

  // Service-role client — used for the overhead read + the insert below.
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Overhead is computed SERVER-SIDE with the service role so the cashier never
  // reads salary/expense data (founder-only under RLS). The client-sent
  // expense_rate (if any) is ignored — the split is fully server-authoritative.
  const { expense_rate } = await fetchOverheadMetrics(admin);
  const profit = computeProfitSplit(total, margin, expense_rate);
  row.expense_allocation = profit.expense_allocation;
  row.bill_casale_share  = profit.bill_casale_share;
  row.net_profit         = profit.net_profit;

  // terminal_type / card_ref only meaningful for card / split — null otherwise
  // (mirrors the page logic; the client already nulls them, this is defensive).
  if (payMethod !== 'card' && payMethod !== 'split') {
    row.terminal_type = null;
    row.card_ref = null;
  }

  let orderId: string | null = null;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('orders').insert(row).select('id').single();
    if (error) err = error.message; else orderId = (data as { id: string }).id;
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'pos_record_sale',
      caller_id: user.id,
      input:     { channel, payment_method: payMethod, total },
      result:    { order_id: orderId, payment_status: row.payment_status, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Sale could not be saved: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, order_id: orderId });
}
