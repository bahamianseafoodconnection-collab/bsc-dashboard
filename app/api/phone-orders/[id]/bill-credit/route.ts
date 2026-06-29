// =====================================================================
// /api/phone-orders/[id]/bill-credit  (G6 — credit order → account)
//
// For an approved phone order whose customer is a founder-approved credit
// account, bill it to the account instead of taking cash: create a
// credit_invoice (the AR ledger the statement generator reads), set the
// order on-account + Confirmed with a due date from the customer's terms,
// bump the customer's running balance, and record the sale financials.
//
//   POST {}   (no body)
//
// Cashier / andros_staff / manager / founder / co_founder / control_admin.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CHANNEL_MARGIN, VAT_RATE, recordSaleFinancials, type PricingChannel } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['cashier', 'andros_staff', 'manager', 'founder', 'co_founder', 'control_admin']);

function daysFromTerms(terms: string | null): number {
  const m = (terms || '').match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  if ((terms || '').toLowerCase().includes('month')) return 30;
  return 7;
}
function addDaysIso(days: number): { date: string } {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days);
  return { date: d.toISOString().slice(0, 10) };
}

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
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot bill to account.` }, { status: 403 });

  const { id: orderId } = await ctx.params;
  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: ord } = await admin.from('orders')
    .select('id, total, status, order_type, payment_status, customer_id, channel').eq('id', orderId).maybeSingle();
  if (!ord) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  const o = ord as { total: number | null; status: string | null; order_type: string | null; payment_status: string | null; customer_id: string | null; channel: string | null };
  if (o.order_type !== 'phone_order') return NextResponse.json({ ok: false, error: 'Not a phone order' }, { status: 400 });
  if (o.status === 'pending_approval') return NextResponse.json({ ok: false, error: 'Order is still awaiting founder approval' }, { status: 409 });
  const ps = (o.payment_status ?? '').toLowerCase();
  if (ps === 'paid' || ps === 'on_account') return NextResponse.json({ ok: true, already: true });
  if (!o.customer_id) return NextResponse.json({ ok: false, error: 'No customer linked to this order' }, { status: 422 });

  const { data: cust } = await admin.from('customers')
    .select('id, full_name, is_credit_customer, credit_limit, credit_terms, current_balance').eq('id', o.customer_id).maybeSingle();
  const c = cust as { full_name: string | null; is_credit_customer: boolean | null; credit_limit: number | null; credit_terms: string | null; current_balance: number | null } | null;
  if (!c || !c.is_credit_customer) return NextResponse.json({ ok: false, error: 'Customer is not approved for credit — approve in Founder → Credit first.' }, { status: 422 });

  const total = Number(o.total ?? 0);
  const balance = Number(c.current_balance ?? 0);
  const limit = Number(c.credit_limit ?? 0);
  if (total <= 0) return NextResponse.json({ ok: false, error: 'Order total is zero' }, { status: 422 });
  if (limit > 0 && balance + total > limit) {
    return NextResponse.json({ ok: false, error: `Over credit limit — balance $${balance.toFixed(2)} + $${total.toFixed(2)} > limit $${limit.toFixed(2)}. Founder must raise the limit.` }, { status: 409 });
  }

  // Idempotency: don't double-bill the same order.
  const { data: existing } = await admin.from('credit_invoices').select('id').eq('order_id', orderId).limit(1);
  if (existing && existing.length > 0) return NextResponse.json({ ok: true, already: true });

  const today = new Date().toISOString().slice(0, 10);
  const due = addDaysIso(daysFromTerms(c.credit_terms)).date;
  const invoiceNumber = `CR-${String(orderId).slice(0, 8).toUpperCase()}`;

  const { error: ciErr } = await admin.from('credit_invoices').insert({
    customer_id: o.customer_id, invoice_number: invoiceNumber, order_id: orderId,
    invoice_date: today, due_date: due, amount_total: total, amount_paid: 0,
    status: 'unpaid', notes: 'Phone order billed to credit account',
  });
  if (ciErr) return NextResponse.json({ ok: false, error: `Credit invoice failed: ${ciErr.message}` }, { status: 500 });

  await admin.from('orders').update({
    payment_status: 'on_account', status: 'Confirmed', credit_due_date: due,
  }).eq('id', orderId);

  await admin.from('customers').update({ current_balance: balance + total }).eq('id', o.customer_id);

  try {
    const channel: PricingChannel = (o.channel && (o.channel in CHANNEL_MARGIN)) ? (o.channel as PricingChannel) : 'online_market';
    const toCost = 1 / ((1 + CHANNEL_MARGIN[channel]) * (1 + VAT_RATE));
    await recordSaleFinancials({ saleAmount: total, costBasis: total * toCost, channel, orderId });
  } catch (e) { console.warn('[bill-credit] financials log failed:', e); }

  return NextResponse.json({ ok: true, billed: true, invoice_number: invoiceNumber, due_date: due, new_balance: balance + total });
}
