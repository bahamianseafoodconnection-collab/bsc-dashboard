'use client';

// app/expenses/page.tsx
//
// Full expense tracking — entry form + list + mark-paid action.
// Backed by public.expenses (see sql/2026-05-08-expenses.sql).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';
import { useServerSave } from '@/lib/useServerSave';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'utilities',
  'rent',
  'payroll',
  'supplier_payment',
  'maintenance',
  'supplies',
  'transport',
  'fees',
  'marketing',
  'equipment',
  'taxes',
  'other',
] as const;

const RECURRING_OPTIONS = [
  ['', '— one-time —'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Biweekly'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['yearly', 'Yearly'],
] as const;

const PAYMENT_METHODS = ['cash', 'transfer', 'check', 'card', 'other'] as const;

type Category = (typeof CATEGORIES)[number];

type Expense = {
  id: string;
  created_at: string;
  description: string;
  category: Category;
  vendor: string | null;
  amount_bsd: number;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  recurring_interval: string | null;
  notes: string | null;
};

type Filter = 'all' | 'unpaid' | 'paid' | 'overdue';

export default function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');

  const [showEntry, setShowEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Entry form fields
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('utilities');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurring, setRecurring] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [notes, setNotes] = useState('');

  // Phase 5: expense create + mark-paid route through server-authoritative APIs.
  const { save: recordExpense } = useServerSave('/api/finance/record-expense');
  const { save: markPaidServer } = useServerSave('/api/finance/mark-paid');

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('expenses')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (err) {
      setError(plainError(err));
      setRows([]);
    } else {
      setRows((data || []) as Expense[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setDescription('');
    setCategory('utilities');
    setVendor('');
    setAmount('');
    setDueDate('');
    setRecurring('');
    setPaidNow(false);
    setPaymentMethod('transfer');
    setPaymentRef('');
    setNotes('');
    setSubmitError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const amt = parseFloat(amount);
    if (!description.trim() || !(amt > 0)) {
      setSubmitError('Description and a positive amount are required.');
      return;
    }
    setSubmitting(true);

    const r = await recordExpense({
      description: description.trim(),
      category,
      vendor: vendor.trim() || null,
      amount_bsd: amt,
      due_date: dueDate || null,
      recurring_interval: recurring || null,
      notes: notes.trim() || null,
      paid_now: paidNow,
      payment_method: paidNow ? paymentMethod : null,
      payment_ref: paidNow ? (paymentRef.trim() || null) : null,
    });
    setSubmitting(false);
    if (!r.ok) {
      setSubmitError(r.error ?? 'Could not record expense');
      return;
    }
    resetForm();
    setShowEntry(false);
    await load();
  }

  async function markPaid(id: string) {
    const method = window.prompt('Payment method (cash / transfer / check / card)?', 'transfer');
    if (!method) return;
    const ref = window.prompt('Payment reference (check #, transfer ref, blank for none)?', '') || null;
    const r = await markPaidServer({ kind: 'expense', id, method, ref });
    if (!r.ok) {
      alert(`Could not mark paid: ${r.error ?? 'unknown error'}`);
      return;
    }
    await load();
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return rows.filter((e) => {
      if (filter === 'unpaid' && e.paid_at) return false;
      if (filter === 'paid' && !e.paid_at) return false;
      if (filter === 'overdue' && (e.paid_at || !e.due_date || e.due_date >= todayIso)) {
        return false;
      }
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !e.description.toLowerCase().includes(q) &&
          !(e.vendor || '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, filter, categoryFilter, search, todayIso]);

  const totalUnpaid = rows
    .filter((e) => !e.paid_at)
    .reduce((s, e) => s + Number(e.amount_bsd || 0), 0);
  const totalDue7 = rows
    .filter(
      (e) =>
        !e.paid_at &&
        e.due_date &&
        e.due_date >= todayIso &&
        e.due_date <= add7Days(todayIso)
    )
    .reduce((s, e) => s + Number(e.amount_bsd || 0), 0);
  const totalOverdue = rows
    .filter((e) => !e.paid_at && e.due_date && e.due_date < todayIso)
    .reduce((s, e) => s + Number(e.amount_bsd || 0), 0);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>
        ← BSC Control
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>
          Expenses
        </h1>
        <button
          onClick={() => {
            resetForm();
            setShowEntry(true);
          }}
          style={primaryBtnStyle}
        >
          + New
        </button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Operational outflows · feeds /accounts-payable for what you owe and when.
      </p>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label="Outstanding" value={`$${totalUnpaid.toFixed(2)}`} />
        <Stat label="Due in 7 days" value={`$${totalDue7.toFixed(2)}`} accent="#f5c518" />
        <Stat label="Overdue" value={`$${totalOverdue.toFixed(2)}`} accent={totalOverdue > 0 ? '#f87171' : '#94a3b8'} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
        {(
          [
            ['unpaid',  'Unpaid'],
            ['overdue', 'Overdue'],
            ['paid',    'Paid'],
            ['all',     'All'],
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
        <button
          onClick={() => setCategoryFilter('all')}
          style={{
            ...filterPillStyle,
            background: categoryFilter === 'all' ? '#0d1f3c' : '#111c33',
            color: '#cbd5e1',
            border:
              categoryFilter === 'all' ? '1px solid #f5c518' : '1px solid #1e2d4a',
          }}
        >
          all categories
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            style={{
              ...filterPillStyle,
              background: categoryFilter === c ? '#0d1f3c' : '#111c33',
              color: '#cbd5e1',
              border:
                categoryFilter === c ? '1px solid #f5c518' : '1px solid #1e2d4a',
            }}
          >
            {c.replace('_', ' ')}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search description or vendor…"
        style={inputStyle}
      />

      {loading && <p style={{ color: '#94a3b8' }}>Loading expenses…</p>}

      {!loading && error && (
        <div style={errorBoxStyle}>
          ⚠️ Could not load expenses: {error}.
          {error.toLowerCase().includes('relation') && (
            <div style={{ marginTop: 6 }}>
              Run <strong>sql/2026-05-08-expenses.sql</strong> in the Supabase SQL
              editor to create the table.
            </div>
          )}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No expenses match. Hit “+ New” to add one.
        </div>
      )}

      {filtered.map((e) => {
        const overdue = !e.paid_at && e.due_date && e.due_date < todayIso;
        const dueSoon =
          !e.paid_at && e.due_date && e.due_date >= todayIso && e.due_date <= add7Days(todayIso);
        return (
          <div
            key={e.id}
            style={{
              ...cardStyle,
              borderLeft: `4px solid ${
                e.paid_at ? '#22c55e' : overdue ? '#f87171' : dueSoon ? '#f5c518' : '#64748b'
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
                  {e.description}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {e.category.replace('_', ' ')}
                  {e.vendor ? ` · ${e.vendor}` : ''}
                  {e.recurring_interval ? ` · ${e.recurring_interval}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518' }}>
                  ${Number(e.amount_bsd).toFixed(2)}
                </div>
                {e.paid_at ? (
                  <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2 }}>
                    PAID {fmtDate(e.paid_at)}
                  </div>
                ) : e.due_date ? (
                  <div
                    style={{
                      fontSize: 10,
                      color: overdue ? '#f87171' : dueSoon ? '#f5c518' : '#94a3b8',
                      marginTop: 2,
                    }}
                  >
                    {overdue ? 'OVERDUE ' : 'due '}
                    {e.due_date}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>no due date</div>
                )}
              </div>
            </div>

            {(e.payment_method || e.payment_ref) && e.paid_at && (
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                via {e.payment_method}
                {e.payment_ref ? ` · ref ${e.payment_ref}` : ''}
              </div>
            )}

            {e.notes && (
              <div
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  marginTop: 6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {e.notes}
              </div>
            )}

            {!e.paid_at && (
              <button
                onClick={() => markPaid(e.id)}
                style={{
                  marginTop: 10,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                ✓ Mark paid
              </button>
            )}
          </div>
        );
      })}

      {/* Entry modal */}
      {showEntry && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEntry(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            zIndex: 200,
            padding: 20,
            overflowY: 'auto',
          }}
        >
          <form
            onSubmit={submit}
            style={{
              background: '#0d1f3c',
              border: '1px solid #1e3a5f',
              borderRadius: 14,
              padding: 18,
              width: '100%',
              maxWidth: 480,
              marginTop: 20,
              marginBottom: 40,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 14,
              }}
            >
              <h2 style={{ fontSize: 16, color: '#f5c518', fontWeight: 900, margin: 0 }}>
                New expense
              </h2>
              <button
                type="button"
                onClick={() => setShowEntry(false)}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #1e3a5f',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

            <FieldLabel>Description *</FieldLabel>
            <input
              type="text"
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="e.g. BPL bill — May"
              style={inputStyle}
              required
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Category</FieldLabel>
                <select
                  value={category}
                  onChange={(ev) => setCategory(ev.target.value as Category)}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} style={{ background: '#0d1f3c' }}>
                      {c.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Amount (BSD) *</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(ev) => setAmount(ev.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            <FieldLabel>Vendor (who&rsquo;s owed)</FieldLabel>
            <input
              type="text"
              value={vendor}
              onChange={(ev) => setVendor(ev.target.value)}
              placeholder="e.g. BPL · Tropic Seafood · Bill Casale"
              style={inputStyle}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Due date</FieldLabel>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(ev) => setDueDate(ev.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Recurring</FieldLabel>
                <select
                  value={recurring}
                  onChange={(ev) => setRecurring(ev.target.value)}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {RECURRING_OPTIONS.map(([v, label]) => (
                    <option key={v} value={v} style={{ background: '#0d1f3c' }}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#cbd5e1',
                fontSize: 13,
                margin: '12px 0 8px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={paidNow}
                onChange={(ev) => setPaidNow(ev.target.checked)}
              />
              Mark as paid now
            </label>

            {paidNow && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Payment method</FieldLabel>
                  <select
                    value={paymentMethod}
                    onChange={(ev) => setPaymentMethod(ev.target.value)}
                    style={{ ...inputStyle, appearance: 'none' }}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m} style={{ background: '#0d1f3c' }}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Reference</FieldLabel>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(ev) => setPaymentRef(ev.target.value)}
                    placeholder="check #, ref, etc."
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={2}
              placeholder="Anything worth remembering"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />

            {submitError && <div style={errorBoxStyle}>⚠️ {submitError}</div>}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 14,
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                background: submitting ? '#4b5563' : '#f5c518',
                color: '#060d1f',
                fontWeight: 900,
                fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Saving…' : 'Save expense'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* helpers */

function add7Days(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

/* primitives */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 11,
        letterSpacing: 1,
        color: '#94a3b8',
        fontWeight: 700,
        textTransform: 'uppercase',
        margin: '12px 0 5px',
      }}
    >
      {children}
    </label>
  );
}

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

/* styles */

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
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: '#111c33',
  border: '1px solid #1e2d4a',
  color: '#fff',
  fontSize: 14,
  marginBottom: 8,
  boxSizing: 'border-box',
  outline: 'none',
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
const primaryBtnStyle: React.CSSProperties = {
  background: '#f5c518',
  color: '#060d1f',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 900,
  fontSize: 13,
  cursor: 'pointer',
};
const errorBoxStyle: React.CSSProperties = {
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid #f87171',
  borderRadius: 10,
  padding: 12,
  color: '#f87171',
  fontSize: 12,
  fontWeight: 600,
  margin: '8px 0',
};
