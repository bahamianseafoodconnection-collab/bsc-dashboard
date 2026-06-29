// =====================================================================
// /api/founder/credit  (G6 — founder credit approval + terms)
//
// Founder approves a customer for a credit account and sets the limit +
// terms (NET_7 / NET_30 …). Credit orders then bill to that account
// (/api/phone-orders/[id]/bill-credit → credit_invoices → statements).
//
//   GET  ?q=<name|phone>  → matching customers + their credit state
//                          (no q → current credit customers)
//   POST { customer_id, is_credit_customer, credit_limit, credit_terms }
//
// Founder / co_founder / control_admin / manager.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVERS = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

async function gate(req: NextRequest): Promise<{ admin: SupabaseClient; userId: string } | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return { error: 'Server not configured', status: 500 };
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 };
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { error: 'Sign in required', status: 401 };
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !APPROVERS.has(role)) return { error: 'Founder / manager only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

const COLS = 'id, full_name, phone, is_credit_customer, credit_limit, credit_terms, current_balance, credit_approved_at';

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  let query = g.admin.from('customers').select(COLS).order('full_name').limit(50);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  else query = query.eq('is_credit_customer', true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, customers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : null;
  if (!customerId) return NextResponse.json({ ok: false, error: 'customer_id required' }, { status: 400 });
  const isCredit = body.is_credit_customer === true;
  const limit = Number(body.credit_limit);
  const terms = typeof body.credit_terms === 'string' && body.credit_terms.trim() ? body.credit_terms.trim().toUpperCase() : 'NET_7';
  if (isCredit && !(limit >= 0)) return NextResponse.json({ ok: false, error: 'Valid credit_limit required' }, { status: 400 });

  const patch: Record<string, unknown> = {
    is_credit_customer: isCredit,
    credit_limit: isCredit ? limit : 0,
    credit_terms: isCredit ? terms : null,
    credit_approved_by: isCredit ? g.userId : null,
    credit_approved_at: isCredit ? new Date().toISOString() : null,
  };
  const { error } = await g.admin.from('customers').update(patch).eq('id', customerId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
