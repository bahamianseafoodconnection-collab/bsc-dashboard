'use client';

// app/payroll/page.tsx
//
// Pay period tracker. One row per (staff × period). Hourly or salaried.
// On "Mark paid", also writes a matching expenses row in the 'payroll'
// category so AP / reports stay consistent.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Staff = { id: string; full_name: string | null; email: string | null; role: string };

type PayrollEntry = {
  id: string;
  staff_user_id: string | null;
  staff_name: string;
  pay_period_start: string;
  pay_period_end: string;
  hours: number | null;
  hourly_rate: number | null;
  salary_amount: number | null;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  paid_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  notes: string | null;
};

type Filter = 'all' | 'unpaid' | 'paid';
type PayMode = 'hourly' | 'salary';

export default function PayrollPage() {
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('unpaid');

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form
  const [staffUserId, setStaffUserId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [mode, setMode] = useState<PayMode>('salary');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [salary, setSalary] = useState('');
  const [deductions, setDeductions] = useState('0');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    const [entryRes, staffRes] = await Promise.all([
      supabase
        .from('payroll_entries')
        .select('*')
        .order('pay_period_end', { ascending: false })
        .limit(500),
      // Try a couple of name column variants for the users select.
      supabase.from('users').select('id, full_name, email, role').limit(200),
    ]);
    if (entryRes.error) {
      setError(entryRes.error.message);
      setEntries([]);
    } else {
      setEntries((entryRes.data || []) as PayrollEntry[]);
    }
    if (!staffRes.error) {
      setStaff((staffRes.data || []) as Staff[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setStaffUserId(''); setStaffName(''); setPeriodStart(''); setPeriodEnd('');
    setMode('salary'); setHours(''); setRate(''); setSalary(''); setDeductions('0'); setNotes('');
    setFormError(null);
  }

  // Computed gross + net
  const computedGross = mode === 'hourly'
    ? (parseFloat(hours) || 0) * (parseFloat(rate) || 0)
    : (parseFloat(salary) || 0);
  const computedNet = Math.max(0, computedGross - (parseFloat(deductions) || 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!staffName.trim()) { setFormError('Staff name required.'); return; }
    if (!periodStart || !periodEnd) { setFormError('Pay period dates required.'); return; }
    if (computedGross <= 0) { setFormError('Gross pay must be greater than zero.'); return; }
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    const payload: Record<string, unknown> = {
      staff_user_id: staffUserId || null,
      staff_name: staffName.trim(),
      pay_period_start: periodStart,
      pay_period_end: periodEnd,
      gross_pay: round2(computedGross),
      deductions: round2(parseFloat(deductions) || 0),
      net_pay: round2(computedNet),
      notes: notes.trim() || null,
      recorded_by: user?.id ?? null,
    };
    if (mode === 'hourly') {
      payload.hours = parseFloat(hours) || 0;
      payload.hourly_rate = parseFloat(rate) || 0;
    } else {
      payload.salary_amount = parseFloat(salary) || 0;
    }

    const { error: err } = await supabase.from('payroll_entries').insert(payload);
    setSubmitting(false);
    if (err) { setFormError(err.message); return; }
    resetForm();
    setShowForm(false);
    await load();
  }

  async function markPaid(entry: PayrollEntry) {
    const method = window.prompt(
      'Payment method (cash / transfer / check / card)?', 'transfer'
    );
    if (!method) return;
    const ref = window.prompt('Payment reference (check #, transfer ref)?', '') || null;
    const nowIso = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();

    const { error: payErr } = await supabase
      .from('payroll_entries')
      .update({
        paid_at: nowIso,
        payment_method: method,
        payment_ref: ref,
        updated_at: nowIso,
      })
      .eq('id', entry.id);
    if (payErr) { alert(`Could not mark paid: ${payErr.message}`); return; }

    // Mirror as an expenses row in the payroll category. Fails-soft.
    await supabase.from('expenses').insert({
      description: `Payroll · ${entry.staff_name} · ${entry.pay_period_start} to ${entry.pay_period_end}`,
      category: 'payroll',
      vendor: entry.staff_name,
      amount_bsd: entry.net_pay,
      due_date: entry.pay_period_end,
      paid_at: nowIso,
      payment_method: method,
      payment_ref: ref,
      recorded_by: user?.id ?? null,
      notes: `Auto-generated from payroll entry ${entry.id}`,
    }).then((r) => {
      if (r.error) console.warn('Expenses mirror failed:', r.error);
    });

    await load();
  }

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter === 'unpaid' && e.paid_at) return false;
      if (filter === 'paid' && !e.paid_at) return false;
      return true;
    });
  }, [entries, filter]);

  const unpaidTotal = entries.filter((e) => !e.paid_at).reduce((s, e) => s + Number(e.net_pay), 0);
  const paidThisMonth = entries
    .filter((e) => e.paid_at && e.paid_at.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, e) => s + Number(e.net_pay), 0);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Payroll</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={primaryBtnStyle}>+ New entry</button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Pay periods per staff member. "Mark paid" mirrors into expenses.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Outstanding payroll" value={`$${unpaidTotal.toFixed(2)}`} accent={unpaidTotal > 0 ? '#f87171' : '#94a3b8'} />
        <Stat label="Paid this month" value={`$${paidThisMonth.toFixed(2)}`} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['unpaid', 'paid', 'all'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              ...filterPillStyle,
              background: filter === k ? '#f5c518' : '#1e2d4a',
              color: filter === k ? '#060d1f' : '#cbd5e1',
              textTransform: 'capitalize',
            }}
          >{k}</button>
        ))}
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {!loading && error && (
        <ErrorBox text={`payroll_entries: ${error}`} migration="sql/2026-05-09-payroll.sql" />
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No payroll entries match. Hit "+ New entry" to add one.
        </div>
      )}

      {filtered.map((e) => (
        <div
          key={e.id}
          style={{
            ...cardStyle,
            borderLeft: `4px solid ${e.paid_at ? '#22c55e' : '#f5c518'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{e.staff_name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {e.pay_period_start} → {e.pay_period_end}
                {e.hours != null && e.hourly_rate != null && (
                  <> · {e.hours}h × ${Number(e.hourly_rate).toFixed(2)}/h</>
                )}
                {e.salary_amount != null && <> · salary</>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518' }}>
                ${Number(e.net_pay).toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                gross ${Number(e.gross_pay).toFixed(2)}
                {Number(e.deductions) > 0 && ` − ${Number(e.deductions).toFixed(2)} ded.`}
              </div>
              {e.paid_at && (
                <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2 }}>
                  PAID {e.paid_at.slice(0, 10)}
                </div>
              )}
            </div>
          </div>

          {!e.paid_at && (
            <button
              onClick={() => markPaid(e)}
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
      ))}

      {/* Entry form modal */}
      {showForm && (
        <div
          onClick={(ev) => { if (ev.target === ev.currentTarget) { setShowForm(false); resetForm(); } }}
          style={overlayStyle}
        >
          <form onSubmit={submit} style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, color: '#f5c518', fontWeight: 900, margin: 0 }}>New payroll entry</h2>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} style={ghostBtnStyle}>Cancel</button>
            </div>

            <FieldLabel>Staff member</FieldLabel>
            <select
              value={staffUserId}
              onChange={(ev) => {
                const v = ev.target.value;
                setStaffUserId(v);
                const s = staff.find((x) => x.id === v);
                if (s) setStaffName(s.full_name || s.email || '');
              }}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="" style={{ background: '#0d1f3c' }}>— pick or type below —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id} style={{ background: '#0d1f3c' }}>
                  {s.full_name || s.email} ({s.role})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={staffName}
              onChange={(ev) => setStaffName(ev.target.value)}
              placeholder="Or type the staff name"
              style={inputStyle}
              required
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Period start</FieldLabel>
                <input type="date" value={periodStart} onChange={(ev) => setPeriodStart(ev.target.value)} style={inputStyle} required />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Period end</FieldLabel>
                <input type="date" value={periodEnd} onChange={(ev) => setPeriodEnd(ev.target.value)} style={inputStyle} required />
              </div>
            </div>

            <FieldLabel>Pay mode</FieldLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(['salary', 'hourly'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    border: mode === m ? '2px solid #f5c518' : '1.5px solid #1e2d4a',
                    background: mode === m ? '#1a1200' : '#111c33',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >{m}</button>
              ))}
            </div>

            {mode === 'hourly' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Hours</FieldLabel>
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={hours} onChange={(ev) => setHours(ev.target.value)} placeholder="40" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Hourly rate</FieldLabel>
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={rate} onChange={(ev) => setRate(ev.target.value)} placeholder="15.00" style={inputStyle} />
                </div>
              </div>
            ) : (
              <>
                <FieldLabel>Salary amount (BSD)</FieldLabel>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={salary} onChange={(ev) => setSalary(ev.target.value)} placeholder="2500.00" style={inputStyle} required />
              </>
            )}

            <FieldLabel>Deductions (BSD)</FieldLabel>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={deductions} onChange={(ev) => setDeductions(ev.target.value)} placeholder="0" style={inputStyle} />

            <div
              style={{
                background: 'rgba(245,197,24,0.08)',
                border: '1px solid #f5c51840',
                borderRadius: 8,
                padding: 10,
                fontSize: 12,
                color: '#f5c518',
                margin: '12px 0',
              }}
            >
              Gross ${computedGross.toFixed(2)} − deductions ${(parseFloat(deductions) || 0).toFixed(2)} = <strong>net ${computedNet.toFixed(2)}</strong>
            </div>

            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={2}
              placeholder="Anything worth recording (bonus, overtime split, etc.)"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />

            {formError && <ErrorBox text={formError} />}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 12,
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
              {submitting ? 'Saving…' : 'Save payroll entry'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', margin: '12px 0 5px' }}>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text, migration }: { text: string; migration?: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
      {migration && text.toLowerCase().includes('relation') && (
        <div style={{ marginTop: 6 }}>Run {migration} in the Supabase SQL editor.</div>
      )}
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 640, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' };
const filterPillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
const primaryBtnStyle: React.CSSProperties = { background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer' };
const ghostBtnStyle: React.CSSProperties = { background: 'transparent', color: '#94a3b8', border: '1px solid #1e3a5f', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 200, padding: 20, overflowY: 'auto' };
const modalStyle: React.CSSProperties = { background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, padding: 18, width: '100%', maxWidth: 480, marginTop: 20, marginBottom: 40 };
