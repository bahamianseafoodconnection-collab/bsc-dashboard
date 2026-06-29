// =====================================================================
// /api/account/statements  (G10 — customer-facing statements / balance)
//
// Self-service AR view for the signed-in customer: outstanding balance,
// invoices (DUE/OVERDUE), payments received, and downloadable saved
// statements. credit_invoices/credit_payments are staff-only RLS, so this
// runs service-role and is strictly scoped to the caller's own customer
// record (customers.auth_user_id = auth.uid()).
//
//   GET → { ok, is_credit, balance, credit_limit, available, account_status,
//           invoices, payments, statements }
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { allocateStatement, type RawInvoice, type RawPayment } from '@/lib/statements/allocate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  const empty = { ok: true, is_credit: false, balance: 0, credit_limit: 0, available: 0, account_status: 'CURRENT', invoices: [], payments: [], statements: [] };
  if (!url || !anon || !svc || !authHeader.startsWith('Bearer ')) return NextResponse.json(empty);

  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json(empty);

  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: cust } = await admin.from('customers')
    .select('id, full_name, is_credit_customer, credit_limit, current_balance')
    .eq('auth_user_id', user.id).maybeSingle();
  const c = cust as { id: string; full_name: string | null; is_credit_customer: boolean | null; credit_limit: number | null; current_balance: number | null } | null;
  if (!c) return NextResponse.json(empty);

  const [{ data: invRows }, { data: payRows }, { data: stmtRows }] = await Promise.all([
    admin.from('credit_invoices').select('id, invoice_number, invoice_date, due_date, amount_total').eq('customer_id', c.id),
    admin.from('credit_payments').select('id, payment_date, amount, payment_method, reference').eq('customer_id', c.id),
    admin.from('credit_statements').select('id, period_end, total_outstanding, status, pdf_path, sent_at').eq('customer_id', c.id).in('status', ['approved', 'sent']).order('period_end', { ascending: false }).limit(12),
  ]);

  const asOf = new Date().toISOString().slice(0, 10);
  const alloc = allocateStatement((invRows ?? []) as RawInvoice[], (payRows ?? []) as RawPayment[], { creditLimit: Number(c.credit_limit ?? 0), asOf });

  // Signed download links for saved statements.
  const statements = await Promise.all(((stmtRows ?? []) as Array<{ id: string; period_end: string; total_outstanding: number; status: string; pdf_path: string | null; sent_at: string | null }>).map(async (s) => {
    let pdf_url: string | null = null;
    if (s.pdf_path) { const { data } = await admin.storage.from('statements').createSignedUrl(s.pdf_path, 3600); pdf_url = data?.signedUrl ?? null; }
    return { id: s.id, period_end: s.period_end, total_outstanding: s.total_outstanding, status: s.status, sent_at: s.sent_at, pdf_url };
  }));

  return NextResponse.json({
    ok: true,
    is_credit: !!c.is_credit_customer,
    balance: alloc.total_outstanding,
    credit_limit: alloc.credit_limit,
    available: alloc.available_credit,
    account_status: alloc.account_status,
    invoices: alloc.invoices,
    payments: alloc.payments,
    statements,
  });
}
