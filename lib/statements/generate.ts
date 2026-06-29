// =====================================================================
// lib/statements/generate.ts
//
// Server-side statement generation (service-role). Shared by the cron
// and the founder "regenerate" action. NEVER sends — only produces a
// PENDING credit_statements row + uploaded PDF for founder approval.
//
// Cadence (founder decision 2026-06-28), read per customer:
//   • credit_terms NET_≤7 / "weekly"  → every Monday (America/Nassau)
//   • otherwise (NET_15/30, "monthly") → last day of the month
//   • EVENT OVERRIDE: outstanding ≥ credit_limit → generate immediately,
//     any day, regardless of cadence (trigger_reason = 'credit_breach')
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { allocateStatement, type RawInvoice, type RawPayment } from './allocate';
import { renderStatementPdf } from './pdf';

export type Cadence = 'weekly' | 'monthly';

export function cadenceFor(terms: string | null): Cadence {
  const t = (terms || '').toLowerCase();
  if (t.includes('week')) return 'weekly';
  if (t.includes('month')) return 'monthly';
  const m = t.match(/(\d+)/);
  const days = m ? parseInt(m[1], 10) : 30;
  return days <= 7 ? 'weekly' : 'monthly';
}

// Date facts in America/Nassau (handles Bahamas DST correctly).
export function nassauDateInfo(d: Date = new Date()): { iso: string; isMonday: boolean; isLastDayOfMonth: boolean } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Nassau', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const iso = `${get('year')}-${get('month')}-${get('day')}`;
  const isMonday = get('weekday') === 'Mon';
  // Tomorrow in Nassau: if its month differs, today is the last day.
  const tomorrow = new Date(d.getTime() + 24 * 3600 * 1000);
  const tMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Nassau', month: '2-digit' }).format(tomorrow);
  return { iso, isMonday, isLastDayOfMonth: tMonth !== get('month') };
}

export function isScheduledDue(cadence: Cadence, info = nassauDateInfo()): boolean {
  return cadence === 'weekly' ? info.isMonday : info.isLastDayOfMonth;
}

interface CustomerRow {
  id: string; full_name: string | null; phone: string | null; email: string | null;
  address: string | null; credit_limit: number | null; credit_terms: string | null;
}

export interface GenResult {
  customer_id: string; customer: string; outcome: 'created' | 'skipped' | 'error';
  reason?: string; statement_id?: string; outstanding?: number;
}

// Generate one customer's statement (idempotent on (customer_id, period_end)).
async function generateOne(
  admin: SupabaseClient, c: CustomerRow, asOfIso: string, triggerReason: 'scheduled' | 'credit_breach' | 'manual',
): Promise<GenResult> {
  const name = c.full_name || 'Customer';
  try {
    const { data: invRows } = await admin.from('credit_invoices')
      .select('id, invoice_number, invoice_date, due_date, amount_total').eq('customer_id', c.id);
    const { data: payRows } = await admin.from('credit_payments')
      .select('id, payment_date, amount, payment_method, reference').eq('customer_id', c.id);

    const invoices = (invRows ?? []) as RawInvoice[];
    const payments = (payRows ?? []) as RawPayment[];
    if (invoices.length === 0 && payments.length === 0) {
      return { customer_id: c.id, customer: name, outcome: 'skipped', reason: 'no activity' };
    }

    const alloc = allocateStatement(invoices, payments, { creditLimit: Number(c.credit_limit ?? 0), asOf: asOfIso });

    // Already have a live statement for this period? Skip (idempotent).
    const { data: existing } = await admin.from('credit_statements')
      .select('id').eq('customer_id', c.id).eq('period_end', asOfIso).neq('status', 'void').limit(1);
    if (existing && existing.length > 0) {
      return { customer_id: c.id, customer: name, outcome: 'skipped', reason: 'already generated for period', statement_id: (existing[0] as { id: string }).id };
    }

    // Period start = day after the last statement's period_end, else earliest invoice date.
    const { data: lastStmt } = await admin.from('credit_statements')
      .select('period_end').eq('customer_id', c.id).neq('status', 'void')
      .not('period_end', 'is', null).order('period_end', { ascending: false }).limit(1);
    const earliestInv = invoices.map((i) => i.invoice_date).sort()[0] ?? null;
    const periodStart = (lastStmt && lastStmt[0] as { period_end?: string } | undefined)?.period_end ?? earliestInv;

    const pdf = await renderStatementPdf({
      customer: { full_name: c.full_name, phone: c.phone, email: c.email, address: c.address },
      statementDate: new Date().toISOString(),
      periodStart, periodEnd: asOfIso, allocation: alloc,
    });

    const path = `${c.id}/${asOfIso}.pdf`;
    const up = await admin.storage.from('statements').upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true });
    if (up.error) return { customer_id: c.id, customer: name, outcome: 'error', reason: `upload: ${up.error.message}` };

    const { data: ins, error } = await admin.from('credit_statements').insert({
      customer_id: c.id,
      statement_date: new Date().toISOString(),
      period_start: periodStart, period_end: asOfIso,
      status: 'pending', trigger_reason: triggerReason,
      pdf_path: path,
      total_invoiced: alloc.total_invoiced, total_paid: alloc.total_paid,
      total_outstanding: alloc.total_outstanding, account_status: alloc.account_status,
      customer_snapshot: { full_name: c.full_name, phone: c.phone, email: c.email, address: c.address, credit_limit: c.credit_limit, credit_terms: c.credit_terms },
      transactions: { invoices: alloc.invoices, payments: alloc.payments },
    }).select('id').single();
    if (error) return { customer_id: c.id, customer: name, outcome: 'error', reason: error.message };

    return { customer_id: c.id, customer: name, outcome: 'created', statement_id: (ins as { id: string }).id, outstanding: alloc.total_outstanding };
  } catch (e) {
    return { customer_id: c.id, customer: name, outcome: 'error', reason: e instanceof Error ? e.message : 'unknown' };
  }
}

// Sweep every credit customer; generate where cadence-due OR credit breached.
export async function runStatementGeneration(
  admin: SupabaseClient, opts: { force?: boolean; onlyCustomerId?: string } = {},
): Promise<{ asOf: string; results: GenResult[] }> {
  const info = nassauDateInfo();
  const asOf = info.iso;

  let q = admin.from('customers')
    .select('id, full_name, phone, email, address, credit_limit, credit_terms')
    .eq('is_credit_customer', true);
  if (opts.onlyCustomerId) q = q.eq('id', opts.onlyCustomerId);
  const { data: customers } = await q;

  const results: GenResult[] = [];
  for (const c of (customers ?? []) as CustomerRow[]) {
    const cadence = cadenceFor(c.credit_terms);
    const scheduledDue = isScheduledDue(cadence, info);

    // Cheap breach probe (totals only) to decide the event override.
    let breached = false;
    if (!scheduledDue && !opts.force) {
      const { data: inv } = await admin.from('credit_invoices').select('amount_total').eq('customer_id', c.id);
      const { data: pay } = await admin.from('credit_payments').select('amount').eq('customer_id', c.id);
      const out = (inv ?? []).reduce((s, r) => s + Number((r as { amount_total: number }).amount_total || 0), 0)
        - (pay ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount || 0), 0);
      const limit = Number(c.credit_limit ?? 0);
      breached = limit > 0 && out >= limit;
    }

    if (!opts.force && !scheduledDue && !breached) {
      results.push({ customer_id: c.id, customer: c.full_name || 'Customer', outcome: 'skipped', reason: `not due (${cadence})` });
      continue;
    }
    const reason: 'scheduled' | 'credit_breach' | 'manual' =
      opts.force ? 'manual' : scheduledDue ? 'scheduled' : 'credit_breach';
    results.push(await generateOne(admin, c, asOf, reason));
  }
  return { asOf, results };
}
