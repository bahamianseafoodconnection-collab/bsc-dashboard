'use client';

// app/accounts-payable/page.tsx
//
// Unified "what do I owe and when" view. Aggregates:
//   - Unpaid expenses (public.expenses WHERE paid_at IS NULL)
//   - Open purchase_invoices (balance_owed > 0)
//
// Sorted by due_date, with status pills (overdue / due-this-week / future).
// Mark-paid for expenses goes through the same prompt the /expenses page
// uses. Mark-paid for purchase_invoices opens a payment row in
// invoice_payments and bumps the balance — best-effort, falls back to
// just zeroing balance_owed if payments table isn't present.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

type ExpenseRow = {
  id: string;
  description: string;
  category: string;
  vendor: string | null;
  amount_bsd: number;
  due_date: string | null;
  notes: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_ref: string | null;
  location: string | null;
  total_amount: number | null;
  balance_owed: number | null;
  status: string | null;
  summary: string | null;
  created_at: string;
  due_date?: string | null;
  supplier_name?: string | null;
};

type Payable = {
  id: string;
  source: 'expense' | 'invoice';
  description: string;
  vendor: string | null;
  amount: number;        // amount still owed
  due_date: string | null;
  category_or_status: string;
  raw_id: string;        // original id for the mark-paid call
};

export default function AccountsPayablePage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ expenses?: string; invoices?: string }>({});
  const [filter, setFilter] = useState<'all' | 'overdue' | 'this_week'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrors({});
    const [expRes, invRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, description, category, vendor, amount_bsd, due_date, notes')
        .is('paid_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(500),
      supabase
        .from('purchase_invoices')
        .select('*')
        .gt('balance_owed', 0)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const errs: typeof errors = {};
    if (expRes.error) errs.expenses = expRes.error.message;
    else setExpenses((expRes.data || []) as ExpenseRow[]);

    if (invRes.error) errs.invoices = invRes.error.message;
    else setInvoices((invRes.data || []) as InvoiceRow[]);

    setErrors(errs);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const todayIso = new Date().toISOString().slice(0, 10);
  const weekFromNow = (() => {
    const d = new Date(todayIso);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const items: Payable[] = useMemo(() => {
    const out: Payable[] = [];
    for (const e of expenses) {
      out.push({
        id: `e-${e.id}`,
        source: 'expense',
        description: e.description,
        vendor: e.vendor,
        amount: Number(e.amount_bsd || 0),
        due_date: e.due_date,
        category_or_status: e.category,
        raw_id: e.id,
      });
    }
    for (const inv of invoices) {
      out.push({
        id: `i-${inv.id}`,
        source: 'invoice',
        description: inv.summary || inv.invoice_ref || 'Purchase invoice',
        vendor: inv.supplier_name || inv.location || null,
        amount: Number(inv.balance_owed || 0),
        due_date: inv.due_date ?? null,
        category_or_status: inv.status || 'open',
        raw_id: inv.id,
      });
    }
    out.sort((a, b) => {
      // Nulls last, then ascending by date
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    return out;
  }, [expenses, invoices]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter === 'overdue') return !!it.due_date && it.due_date < todayIso;
      if (filter === 'this_week')
        return !!it.due_date && it.due_date >= todayIso && it.due_date <= weekFromNow;
      return true;
    });
  }, [items, filter, todayIso, weekFromNow]);

  const totalOutstanding = items.reduce((s, it) => s + it.amount, 0);
  const totalOverdue = items
    .filter((it) => !!it.due_date && it.due_date < todayIso)
    .reduce((s, it) => s + it.amount, 0);
  const totalThisWeek = items
    .filter(
      (it) =>
        !!it.due_date && it.due_date >= todayIso && it.due_date <= weekFromNow
    )
    .reduce((s, it) => s + it.amount, 0);

  async function markPaid(it: Payable) {
    const method = window.prompt(
      'Payment method (cash / transfer / check / card)?',
      'transfer'
    );
    if (!method) return;
    const ref =
      window.prompt('Payment reference (check #, transfer ref, blank for none)?', '') || null;
    setBusyId(it.id);
    const nowIso = new Date().toISOString();

    if (it.source === 'expense') {
      const { error } = await supabase
        .from('expenses')
        .update({
          paid_at: nowIso,
          payment_method: method,
          payment_ref: ref,
          updated_at: nowIso,
        })
        .eq('id', it.raw_id);
      if (error) {
        alert(`Could not mark paid: ${plainError(error)}`);
        setBusyId(null);
        return;
      }
    } else {
      // invoice — try the right thing first, fall back if invoice_payments
      // table isn't there.
      const { data: { user } } = await supabase.auth.getUser();
      const paymentInsert = await supabase.from('invoice_payments').insert({
        invoice_id: it.raw_id,
        amount: it.amount,
        note: ref ? `${method} · ref ${ref}` : method,
        recorded_by: user?.id ?? null,
      });
      if (paymentInsert.error) {
        // Fall back: zero balance directly
        console.warn('invoice_payments insert failed, falling back to direct update:', paymentInsert.error);
      }
      const { error: updErr } = await supabase
        .from('purchase_invoices')
        .update({
          balance_owed: 0,
          status: 'paid',
          updated_at: nowIso,
        })
        .eq('id', it.raw_id);
      if (updErr) {
        alert(`Could not mark invoice paid: ${plainError(updErr)}`);
        setBusyId(null);
        return;
      }
    }
    setBusyId(null);
    await load();
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>
        ← BSC Control
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>
        Accounts payable
      </h1>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Everything BSC owes — open expenses + outstanding purchase invoices,
        sorted by due date.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label="Total outstanding" value={`$${totalOutstanding.toFixed(2)}`} />
        <Stat
          label="Due in 7 days"
          value={`$${totalThisWeek.toFixed(2)}`}
          accent="#f5c518"
        />
        <Stat
          label="Overdue"
          value={`$${totalOverdue.toFixed(2)}`}
          accent={totalOverdue > 0 ? '#f87171' : '#94a3b8'}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(
          [
            ['all', 'All'],
            ['overdue', 'Overdue'],
            ['this_week', 'Due this week'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              ...filterPillStyle,
              background: filter === k ? '#f5c518' : '#1e2d4a',
              color: filter === k ? '#060d1f' : '#cbd5e1',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {errors.expenses && (
        <div style={errorBoxStyle}>
          ⚠️ Expenses: {errors.expenses}
          {errors.expenses.toLowerCase().includes('relation') && (
            <div style={{ marginTop: 4 }}>
              Run sql/2026-05-08-expenses.sql in the Supabase SQL editor.
            </div>
          )}
        </div>
      )}
      {errors.invoices && (
        <div style={errorBoxStyle}>
          ⚠️ Purchase invoices: {errors.invoices}
        </div>
      )}

      {!loading && filtered.length === 0 && !errors.expenses && !errors.invoices && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#22c55e', fontWeight: 700 }}>
          ✅ Nothing outstanding. You&rsquo;re clear.
        </div>
      )}

      {filtered.map((it) => {
        const overdue = !!it.due_date && it.due_date < todayIso;
        const dueSoon = !!it.due_date && it.due_date >= todayIso && it.due_date <= weekFromNow;
        return (
          <div
            key={it.id}
            style={{
              ...cardStyle,
              borderLeft: `4px solid ${
                overdue ? '#f87171' : dueSoon ? '#f5c518' : '#64748b'
              }`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                  {it.description}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {it.source === 'expense' ? '🧾 expense' : '📦 PO invoice'}
                  {' · '}
                  {it.category_or_status.replace('_', ' ')}
                  {it.vendor ? ` · ${it.vendor}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518' }}>
                  ${it.amount.toFixed(2)}
                </div>
                {it.due_date ? (
                  <div
                    style={{
                      fontSize: 10,
                      color: overdue ? '#f87171' : dueSoon ? '#f5c518' : '#94a3b8',
                      marginTop: 2,
                    }}
                  >
                    {overdue ? 'OVERDUE ' : 'due '}
                    {it.due_date}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    no due date
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => markPaid(it)}
              disabled={busyId === it.id}
              style={{
                marginTop: 10,
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: busyId === it.id ? '#4b5563' : '#22c55e',
                color: '#fff',
                fontWeight: 800,
                fontSize: 11,
                cursor: busyId === it.id ? 'not-allowed' : 'pointer',
              }}
            >
              {busyId === it.id ? 'Saving…' : '✓ Mark paid'}
            </button>
          </div>
        );
      })}

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 14,
        }}
      >
        <Link href="/expenses" style={ctaLink}>
          + Add an expense
        </Link>
        <Link href="/purchase-orders" style={ctaLink}>
          + New PO
        </Link>
      </div>
    </div>
  );
}

/* primitives */

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: '#0d1f3c',
        border: '1px solid #1e3a5f',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: accent || '#f5c518',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const pgStyle: React.CSSProperties = {
  padding: 16,
  backgroundColor: '#060d1f',
  minHeight: '100vh',
  color: '#fff',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  paddingBottom: 80,
  maxWidth: 640,
  margin: '0 auto',
};
const cardStyle: React.CSSProperties = {
  backgroundColor: '#0d1f3c',
  borderRadius: 12,
  padding: '12px 14px',
  border: '1px solid #1e3a5f',
  marginBottom: 8,
};
const filterPillStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: 'none',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const backStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'rgba(245,197,24,0.1)',
  border: '1px solid #f5c518',
  borderRadius: 8,
  color: '#f5c518',
  fontWeight: 700,
  fontSize: 12,
  padding: '6px 12px',
  marginBottom: 14,
  textDecoration: 'none',
};
const errorBoxStyle: React.CSSProperties = {
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid #f87171',
  borderRadius: 10,
  padding: 12,
  color: '#f87171',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 8,
};
const ctaLink: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  padding: '10px 12px',
  borderRadius: 8,
  background: '#1e2d4a',
  color: '#f5c518',
  fontWeight: 800,
  fontSize: 13,
  textDecoration: 'none',
};
