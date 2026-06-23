// /api/cashier/dashboard
//
// Live "Things to do today" counts + performance summary for the Cashier
// dashboard (the electronic-handbook home screen). Server-authoritative:
// Bearer token → profiles.role gate → service-role client (bypasses RLS so
// counts are accurate regardless of per-table policies).
//
// Order/payment status columns are free-text and have drifted across the app
// (status: pending|placed|completed; payment_status: pending|unpaid|account|
// paid|paid_in_full). So EVERY count is computed in its own try/catch and
// returns null on any error — the UI renders "—" instead of crashing. We never
// let one bad filter take down the whole dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['cashier', 'andros_staff', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin']);

// Midnight today in Nassau (Eastern), expressed as a UTC ISO string. DST-safe:
// derives the zone offset from the current instant rather than hard-coding -4/-5.
function startOfTodayNassauISO(): string {
  const now = new Date();
  const nassauNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Nassau' }));
  const offsetMs = now.getTime() - nassauNow.getTime();
  const midnight = new Date(nassauNow);
  midnight.setHours(0, 0, 0, 0);
  return new Date(midnight.getTime() + offsetMs).toISOString();
}

// Run a count query defensively — any thrown error or Supabase error → null.
// Accepts the Supabase query builder (a PromiseLike) directly.
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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" has no cashier dashboard.` }, { status: 403 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const todayStart = startOfTodayNassauISO();
  const C = () => admin.from('orders').select('id', { count: 'exact', head: true });
  const D = () => admin.from('captured_documents').select('id', { count: 'exact', head: true });

  // ── "Things to do today" — each independent + defensive ──
  const [
    newOrders, awaitingPayment, codAwaitingDispatch, creditAwaitingApproval,
    invoicesToConvert, unpaidPurchaseInvoices,
  ] = await Promise.all([
    // New/pending customer orders not yet fulfilled.
    safeCount(C().in('status', ['pending', 'placed'])),
    // Orders still owed money.
    safeCount(C().in('payment_status', ['pending', 'unpaid', 'account'])),
    // COD orders not yet delivered (payment collected on delivery).
    safeCount(C().or('payment_method.ilike.%cod%,payment_type.ilike.%cod%').neq('fulfillment_status', 'delivered')),
    // Credit orders placed but not yet approved by a manager/founder.
    safeCount(C().eq('payment_status', 'account').is('credit_override_approved_by', null)),
    // Captured purchase invoices not yet linked to a PO/record.
    safeCount(D().in('doc_type', ['purchase_invoice', 'receipt']).is('linked_record_id', null)),
    // Supplier bills still owed.
    safeCount(admin.from('purchase_invoices').select('id', { count: 'exact', head: true }).neq('status', 'paid')),
  ]);

  // ── Performance: this cashier's sales today ──
  let todaySalesCount: number | null = null;
  let todaySalesTotal: number | null = null;
  try {
    const { data: rows, error } = await admin
      .from('orders')
      .select('total')
      .eq('cashier_user_id', user.id)
      .gte('created_at', todayStart);
    if (!error) {
      const list = (rows ?? []) as Array<{ total: number | null }>;
      todaySalesCount = list.length;
      todaySalesTotal = list.reduce((s, r) => s + (Number(r.total) || 0), 0);
    }
  } catch { /* leave null */ }

  return NextResponse.json({
    ok: true,
    cashier: { id: user.id, name: fullName, role },
    today: {
      new_orders:               newOrders,
      awaiting_payment:         awaitingPayment,
      cod_awaiting_dispatch:    codAwaitingDispatch,
      credit_awaiting_approval: creditAwaitingApproval,
      invoices_to_convert:      invoicesToConvert,
      unpaid_purchase_invoices: unpaidPurchaseInvoices,
    },
    performance: {
      today_sales_count: todaySalesCount,
      today_sales_total: todaySalesTotal,
    },
  });
}
