// /api/credit/accounts
//
// Credit Accounts overview — every customer with an approved credit account, plus
// computed available credit / utilisation / over-limit flags, and a portfolio
// summary. Read surface for the Credit Accounts page + the cashier's
// "can this customer take an order on credit?" check.
//
// Per-customer MANAGEMENT (set limit/terms, record payment/charge, ledger) already
// lives at /dashboard/customers/[id] via /api/customers/admin. This is the
// portfolio view. Server-authoritative: Bearer → profiles.role → service-role.
//
// Cashiers may READ (they place credit orders); only admins/founders edit limits
// (that stays in /api/customers/admin).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['cashier', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin', 'basic_admin']);

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
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot view credit accounts.` }, { status: 403 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin
    .from('customers')
    .select('id, full_name, phone, is_credit_customer, credit_terms, credit_limit, current_balance, credit_approved_at, total_orders, total_spent')
    .eq('is_credit_customer', true)
    .order('current_balance', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const accounts = (data ?? []).map((c: {
    id: string; full_name: string | null; phone: string | null; credit_terms: string | null;
    credit_limit: number | null; current_balance: number | null; credit_approved_at: string | null;
    total_orders: number | null; total_spent: number | null;
  }) => {
    const limit = Number(c.credit_limit) || 0;
    const balance = Number(c.current_balance) || 0;
    const available = Math.round((limit - balance) * 100) / 100;
    const utilization = limit > 0 ? Math.round((balance / limit) * 100) : (balance > 0 ? 100 : 0);
    return {
      id: c.id,
      name: c.full_name,
      phone: c.phone,
      terms: c.credit_terms,
      limit,
      balance,
      available,
      utilization,
      over_limit: limit > 0 && balance > limit,
      owing: balance > 0,
      approved_at: c.credit_approved_at,
      total_orders: c.total_orders ?? 0,
      total_spent: Number(c.total_spent) || 0,
    };
  });

  const summary = {
    accounts: accounts.length,
    total_outstanding: Math.round(accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100,
    total_limit: Math.round(accounts.reduce((s, a) => s + a.limit, 0) * 100) / 100,
    over_limit: accounts.filter(a => a.over_limit).length,
    owing: accounts.filter(a => a.owing).length,
  };

  // Cashiers READ balances (to judge credit at POS) but manage nothing — the
  // management detail lives under /dashboard (admin-gated). canManage gates the
  // row drill-in client-side so cashiers aren't bounced by middleware.
  const canManage = ['manager', 'right_hand', 'founder', 'co_founder', 'control_admin', 'basic_admin'].includes(role);
  return NextResponse.json({ ok: true, role, canManage, summary, accounts });
}
