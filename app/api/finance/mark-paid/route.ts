// /api/finance/mark-paid
//
// Server-authoritative "mark paid" for money-state flips that were happening
// browser→RLS direct (Phase 5 sweep, money tables first). Replaces:
//   • app/jaquel/page.tsx confirmSupplierPaid      → supplier_payouts.paid = true
//   • app/jaquel/page.tsx markUtilityProcessed     → utility_payments.payment_status = 'completed'
//   • app/accounts-payable markPaid (expense)      → expenses.paid_at / payment_method / payment_ref
//   • app/accounts-payable markPaid (invoice)      → invoice_payments insert + purchase_invoices flip
//
// Canonical D2 pattern: Bearer-token auth + role gate (mirrors the page's
// client gate), service-role client for the write, ai_writes audit row.
//
// Body: { kind, id, ...extra }
//   • supplier_payout   { id = supplier_id }                       → marks that supplier's UNPAID payouts paid.
//   • utility_payment   { id = utility_payments.id }               → marks it completed.
//   • expense           { id, method, ref }                        → marks expense paid (paid_at = now).
//   • purchase_invoice  { id, amount, method, ref }                → records an invoice_payments row + zeroes balance.
//   • payroll_entry     { id, method, ref }                        → marks payroll paid + mirrors an expenses row.
// Resp: { ok, kind, affected }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Matches the finance pages' client gate (basic_admin/control_admin/founder/co_founder).
const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin']);
const KINDS = new Set(['supplier_payout', 'utility_payment', 'expense', 'purchase_invoice', 'payroll_entry']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot mark payments paid.` }, { status: 403 });
  }

  let body: { kind?: unknown; id?: unknown; amount?: unknown; method?: unknown; ref?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const kind   = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : '';
  const id     = typeof body.id === 'string' ? body.id : '';
  const method = typeof body.method === 'string' && body.method.trim() ? body.method.trim() : null;
  const ref    = typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : null;
  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) ? body.amount : null;
  if (!kind) return NextResponse.json({ ok: false, error: `kind must be one of: ${[...KINDS].join(', ')}` }, { status: 400 });
  if (!id)   return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();

  let affected = 0;
  let err: string | null = null;
  try {
    if (kind === 'supplier_payout') {
      const { data, error } = await admin
        .from('supplier_payouts')
        .update({ paid: true })
        .eq('supplier_id', id)
        .eq('paid', false)
        .select('id');
      if (error) err = error.message; else affected = (data ?? []).length;

    } else if (kind === 'utility_payment') {
      const { data, error } = await admin
        .from('utility_payments')
        .update({ payment_status: 'completed' })
        .eq('id', id)
        .select('id');
      if (error) err = error.message; else affected = (data ?? []).length;

    } else if (kind === 'expense') {
      const { data, error } = await admin
        .from('expenses')
        .update({ paid_at: nowIso, payment_method: method, payment_ref: ref, updated_at: nowIso })
        .eq('id', id)
        .select('id');
      if (error) err = error.message; else affected = (data ?? []).length;

    } else if (kind === 'purchase_invoice') {
      // Record the payment row (best-effort — same fallback the page had),
      // then zero the balance + flip status authoritatively.
      const { error: payErr } = await admin.from('invoice_payments').insert({
        invoice_id:  id,
        amount:      amount ?? 0,
        note:        ref ? `${method ?? 'payment'} · ref ${ref}` : (method ?? 'payment'),
        recorded_by: user.id,
      });
      if (payErr) console.warn('invoice_payments insert failed (non-fatal, zeroing balance):', payErr.message);
      const { data, error } = await admin
        .from('purchase_invoices')
        .update({ balance_owed: 0, status: 'paid', updated_at: nowIso })
        .eq('id', id)
        .select('id');
      if (error) err = error.message; else affected = (data ?? []).length;

    } else { // payroll_entry
      // Read the entry server-side so the mirrored expense amount can't be
      // client-forged, then mark paid + mirror to expenses (fails-soft).
      const { data: entry, error: readErr } = await admin
        .from('payroll_entries')
        .select('id, staff_name, net_pay, pay_period_start, pay_period_end, paid_at')
        .eq('id', id)
        .maybeSingle<{ id: string; staff_name: string; net_pay: number; pay_period_start: string; pay_period_end: string; paid_at: string | null }>();
      if (readErr || !entry) { err = readErr?.message ?? 'Payroll entry not found'; }
      else {
        const { data, error } = await admin
          .from('payroll_entries')
          .update({ paid_at: nowIso, payment_method: method, payment_ref: ref, updated_at: nowIso })
          .eq('id', id)
          .select('id');
        if (error) err = error.message; else affected = (data ?? []).length;

        if (!err && !entry.paid_at) {
          // Mirror as an expenses row in the payroll category — only on the
          // first paid flip (entry wasn't already paid), to avoid duplicates.
          const { error: mirrorErr } = await admin.from('expenses').insert({
            description:    `Payroll · ${entry.staff_name} · ${entry.pay_period_start} to ${entry.pay_period_end}`,
            category:       'payroll',
            vendor:         entry.staff_name,
            amount_bsd:     entry.net_pay,
            due_date:       entry.pay_period_end,
            paid_at:        nowIso,
            payment_method: method,
            payment_ref:    ref,
            recorded_by:    user.id,
            notes:          `Auto-generated from payroll entry ${entry.id}`,
          });
          if (mirrorErr) console.warn('payroll→expenses mirror failed (non-fatal):', mirrorErr.message);
        }
      }
    }
  } catch (e) {
    err = e instanceof Error ? e.message : 'update failed';
  }

  // Audit (non-fatal).
  try {
    await admin.from('ai_writes').insert({
      tool:      'finance_mark_paid',
      caller_id: user.id,
      input:     { kind, id, amount, method, ref },
      result:    { affected, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Mark-paid failed: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, kind, affected });
}
