// /api/founder/bank
//
// Bank reconciliation for the founder: a persistent bank-transaction ledger
// (uploaded statement lines) reconciled against system money movements.
//
//   GET    ?from&to  → bank totals vs system totals (sales / payments received /
//                      COD / credit payments / supplier payments) + differences
//                      + the transaction list for the window.
//   POST   { rows }  → import parsed statement lines (dedup on exact match).
//   DELETE ?id       → remove one line (fix a bad parse).
//
// Founder-only. Service-role (bypasses RLS — bank_transactions has RLS on with
// no policies, so only this route can touch it). Every system total is defensive
// (drifted free-text statuses → 0 on error, never a 500).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);

async function auth(req: NextRequest): Promise<{ ok: true; admin: SupabaseClient; userId: string } | { ok: false; status: number; error: string }> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return { ok: false, status: 500, error: 'Supabase not configured' };
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Sign in required' };
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: 'Invalid session' };
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !FOUNDER_ROLES.has(role)) return { ok: false, status: 403, error: 'Founder only.' };
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { ok: true, admin, userId: user.id };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T,>(rows: T[], f: (r: T) => number) => round2(rows.reduce((s, r) => s + (f(r) || 0), 0));

// Default window = current month-to-date (Nassau).
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const nassau = new Date(now.toLocaleString('en-US', { timeZone: 'America/Nassau' }));
  const from = `${nassau.getFullYear()}-${String(nassau.getMonth() + 1).padStart(2, '0')}-01`;
  const to = `${nassau.getFullYear()}-${String(nassau.getMonth() + 1).padStart(2, '0')}-${String(nassau.getDate()).padStart(2, '0')}`;
  return { from, to };
}

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const { admin } = a;
  const url = new URL(req.url);
  const def = defaultRange();
  const from = url.searchParams.get('from') || def.from;
  const to = url.searchParams.get('to') || def.to;
  const fromTs = `${from}T00:00:00`;
  const toTs = `${to}T23:59:59`;

  // Bank side
  const { data: txns } = await admin.from('bank_transactions')
    .select('id, txn_date, description, reference, amount, direction, matched, matched_type')
    .gte('txn_date', from).lte('txn_date', to).order('txn_date', { ascending: false });
  const bankRows = (txns ?? []) as Array<{ id: string; txn_date: string; description: string | null; reference: string | null; amount: number; direction: string; matched: boolean; matched_type: string | null }>;
  const deposits = sum(bankRows.filter(t => Number(t.amount) > 0), t => Number(t.amount));
  const withdrawals = round2(Math.abs(sum(bankRows.filter(t => Number(t.amount) < 0), t => Number(t.amount))));

  // System side — each block defensive.
  const safe = async <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try { const { data, error } = await p; return error ? [] : (data ?? []); } catch { return []; }
  };
  const orders = await safe<{ total: number | null; created_at: string; payment_received_at: string | null; payment_method: string | null; payment_type: string | null }>(
    admin.from('orders').select('total, created_at, payment_received_at, payment_method, payment_type').gte('created_at', fromTs).lte('created_at', toTs));
  const received = await safe<{ total: number | null; payment_received_at: string | null; payment_method: string | null; payment_type: string | null }>(
    admin.from('orders').select('total, payment_received_at, payment_method, payment_type').gte('payment_received_at', fromTs).lte('payment_received_at', toTs));
  const credit = await safe<{ delta: number | null }>(
    admin.from('customer_credit_ledger').select('delta').gte('created_at', fromTs).lte('created_at', toTs).lt('delta', 0));
  const suppliers = await safe<{ total_amount: number | null; total: number | null }>(
    admin.from('purchase_orders').select('total_amount, total, payment_date, payment_status').eq('payment_status', 'paid').gte('payment_date', from).lte('payment_date', to));

  const isCod = (m: string | null, t: string | null) => /cod|cash/i.test(`${m ?? ''} ${t ?? ''}`);
  const system = {
    sales_recorded:    sum(orders, o => Number(o.total)),
    payments_received: sum(received, o => Number(o.total)),
    cod_collected:     sum(received.filter(o => isCod(o.payment_method, o.payment_type)), o => Number(o.total)),
    credit_payments:   round2(Math.abs(sum(credit, c => Number(c.delta)))),
    supplier_payments: sum(suppliers, s => Number(s.total_amount ?? s.total)),
  };

  const differences = {
    deposits_minus_received: round2(deposits - system.payments_received),
    withdrawals_minus_supplier: round2(withdrawals - system.supplier_payments),
  };

  return NextResponse.json({
    ok: true,
    range: { from, to },
    bank: { deposits, withdrawals, net: round2(deposits - withdrawals), count: bankRows.length, unmatched: bankRows.filter(t => !t.matched).length },
    system,
    differences,
    transactions: bankRows,
  });
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const { admin, userId } = a;
  let body: { rows?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ ok: false, error: 'No rows to import' }, { status: 400 });

  let inserted = 0, skipped = 0;
  const errors: string[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    const txn_date = String(raw.txn_date ?? '').slice(0, 10);
    const amount = Number(raw.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txn_date) || !Number.isFinite(amount) || amount === 0) { skipped++; continue; }
    const row = {
      txn_date, amount: round2(amount),
      description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : null,
      reference: typeof raw.reference === 'string' && raw.reference.trim() ? raw.reference.trim().slice(0, 120) : null,
      source: 'upload', uploaded_by: userId,
    };
    const { error } = await admin.from('bank_transactions').insert(row);
    if (error) {
      // 23505 = duplicate (already imported) → skip silently.
      if ((error as { code?: string }).code === '23505' || /duplicate/i.test(error.message)) skipped++;
      else { errors.push(error.message); skipped++; }
    } else inserted++;
  }
  return NextResponse.json({ ok: true, inserted, skipped, errors: errors.slice(0, 3) });
}

export async function DELETE(req: NextRequest) {
  const a = await auth(req);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const { error } = await a.admin.from('bank_transactions').delete().eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
