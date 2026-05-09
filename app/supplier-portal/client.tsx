'use client';

// app/supplier-portal/client.tsx
//
// Authenticated supplier sees their own data: products listed with BSC,
// open invoices, payment history, outstanding balance, and a quick form
// to add a new product offering.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c';
const PANEL = '#0f1a2e';
const GOLD = '#c8860f';
const GOLD_BRIGHT = '#f4c842';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = '#f87171';
const GREEN = '#4ade80';

type Invoice = {
  id: string;
  invoice_ref: string | null;
  total_amount: number | null;
  balance_owed: number | null;
  status: string | null;
  created_at: string;
  due_date?: string | null;
  summary: string | null;
};
type Payment = {
  id: string;
  invoice_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
};
type Product = {
  id: string;
  name: string;
  case_cost: number | null;
  weight_lbs: number | null;
  retail_price: number | null;
  wholesale_price: number | null;
  unit_cost: number | null;
  status: string | null;
};

type Props = {
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  role: string;
  displayName: string | null;
};

export default function SupplierPortalClient({
  supplierId, supplierName, supplierEmail, role, displayName,
}: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ invoices?: string; payments?: string; products?: string }>({});

  // Add-product form state
  const [showProdForm, setShowProdForm] = useState(false);
  const [pName, setPName] = useState('');
  const [pCaseCost, setPCaseCost] = useState('');
  const [pWeight, setPWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrors({});
    const [invRes, payRes, prodRes] = await Promise.all([
      supabase
        .from('purchase_invoices')
        .select('id, invoice_ref, total_amount, balance_owed, status, created_at, due_date, summary')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, note, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('supplier_products')
        .select('id, name, case_cost, weight_lbs, retail_price, wholesale_price, unit_cost, status')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    const errs: typeof errors = {};
    if (invRes.error) errs.invoices = invRes.error.message; else setInvoices((invRes.data || []) as Invoice[]);
    if (payRes.error) errs.payments = payRes.error.message; else setPayments((payRes.data || []) as Payment[]);
    if (prodRes.error) errs.products = prodRes.error.message; else setProducts((prodRes.data || []) as Product[]);
    setErrors(errs);
    setLoading(false);
  }

  useEffect(() => { load(); }, [supplierId]);

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balance_owed || 0), 0);
  const myInvoiceIds = new Set(invoices.map((i) => i.id));
  const myPayments = payments.filter((p) => p.invoice_id && myInvoiceIds.has(p.invoice_id));
  const totalPaid = myPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const liveProducts = products.filter((p) => p.status === 'live').length;
  const pendingProducts = products.filter((p) => p.status === 'pending').length;

  const todayIso = new Date().toISOString().slice(0, 10);

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    if (!pName.trim()) { setSubmitErr('Product name required.'); return; }
    const cc = parseFloat(pCaseCost) || 0;
    const w = parseFloat(pWeight) || 0;
    if (cc <= 0 || w <= 0) { setSubmitErr('Case cost and weight must be > 0.'); return; }
    setSubmitting(true);
    const unitCost = cc / w;
    const { error } = await supabase.from('supplier_products').insert({
      supplier_id: supplierId,
      name: pName.trim(),
      case_cost: cc,
      weight_lbs: w,
      unit_cost: round4(unitCost),
      status: 'pending',
      supplier_name: supplierName,
      created_at: new Date().toISOString(),
    });
    setSubmitting(false);
    if (error) { setSubmitErr(error.message); return; }
    setPName(''); setPCaseCost(''); setPWeight('');
    setShowProdForm(false);
    await load();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, "DM Sans", sans-serif',
        padding: '24px 16px 80px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              BSC · Supplier portal
            </div>
            <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 26, fontWeight: 700, margin: 0 }}>
              {supplierName}
            </h1>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
              {role}{displayName ? ` · ${displayName}` : ''}{supplierEmail ? ` · ${supplierEmail}` : ''}
            </div>
          </div>
          <Link
            href="/dashboard"
            style={{
              fontSize: 12, color: TEXT_DIM, textDecoration: 'none',
              padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}`,
            }}
          >BSC Control →</Link>
        </div>

        {/* Money summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 22 }}>
          <Stat label="Lifetime invoiced" value={`$${totalInvoiced.toFixed(2)}`} />
          <Stat label="Lifetime paid" value={`$${totalPaid.toFixed(2)}`} accent={GREEN} />
          <Stat
            label="BSC owes you"
            value={`$${totalOutstanding.toFixed(2)}`}
            accent={totalOutstanding > 0 ? GOLD_BRIGHT : TEXT_DIM}
          />
        </div>

        {loading && <p style={{ color: TEXT_DIM }}>Loading your data…</p>}

        {(errors.invoices || errors.payments) && (
          <div
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: `1px solid ${RED}33`,
              color: RED,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            ⚠️ Could not load invoices / payments. Some data may be hidden.
          </div>
        )}

        {/* Open invoices */}
        <Section title="Open invoices" right={<span style={{ fontSize: 11, color: TEXT_DIM }}>{invoices.filter((i) => Number(i.balance_owed) > 0).length} open</span>}>
          {invoices.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>No invoices yet.</p>
          ) : (
            invoices.map((i) => {
              const open = Number(i.balance_owed || 0) > 0;
              const overdue = open && i.due_date && i.due_date < todayIso;
              return (
                <div
                  key={i.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    marginTop: 8,
                    borderLeft: `4px solid ${overdue ? RED : open ? GOLD_BRIGHT : GREEN}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                        {i.invoice_ref || 'Invoice'}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                        {i.created_at.slice(0, 10)}
                        {i.summary ? ` · ${i.summary}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: GOLD_BRIGHT }}>
                        ${Number(i.total_amount || 0).toFixed(2)}
                      </div>
                      {open && (
                        <div style={{ fontSize: 11, color: overdue ? RED : GOLD_BRIGHT, marginTop: 2 }}>
                          {overdue ? 'OVERDUE ' : 'open '}${Number(i.balance_owed || 0).toFixed(2)}
                          {i.due_date && ` · due ${i.due_date}`}
                        </div>
                      )}
                      {!open && (
                        <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>PAID</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Section>

        {/* Recent payments */}
        <Section title="Recent payments">
          {myPayments.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>No payments recorded yet.</p>
          ) : (
            myPayments.slice(0, 10).map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginTop: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ color: '#fff' }}>
                  {p.created_at.slice(0, 10)}
                  {p.note ? ` · ${p.note}` : ''}
                </div>
                <div style={{ color: GREEN, fontWeight: 800 }}>
                  ${Number(p.amount).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* My products */}
        <Section
          title="My product offerings"
          right={
            <button
              onClick={() => setShowProdForm((v) => !v)}
              style={{
                background: GOLD_BRIGHT,
                color: NAVY,
                border: 'none',
                borderRadius: 8,
                padding: '5px 12px',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {showProdForm ? '× Cancel' : '+ Submit'}
            </button>
          }
        >
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8 }}>
            {liveProducts} live · {pendingProducts} pending review
          </div>

          {showProdForm && (
            <form
              onSubmit={submitProduct}
              style={{
                background: 'rgba(244,200,66,0.06)',
                border: `1px solid ${GOLD}33`,
                borderRadius: 10,
                padding: 12,
                marginTop: 8,
                marginBottom: 12,
              }}
            >
              <FieldLabel>Product name</FieldLabel>
              <input
                type="text"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. Fresh Grouper Whole"
                style={inputStyle}
                required
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Case cost (BSD)</FieldLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={pCaseCost}
                    onChange={(e) => setPCaseCost(e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Weight (lbs)</FieldLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={pWeight}
                    onChange={(e) => setPWeight(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                    required
                  />
                </div>
              </div>
              {submitErr && (
                <div
                  style={{
                    background: 'rgba(248,113,113,0.08)',
                    border: `1px solid ${RED}33`,
                    color: RED,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    marginBottom: 8,
                  }}
                >
                  ⚠️ {submitErr}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: submitting ? '#4b5563' : GOLD_BRIGHT,
                  color: NAVY,
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  marginTop: 4,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </form>
          )}

          {products.length === 0 ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
              No products listed yet. Hit “+ Submit” to add your first.
            </p>
          ) : (
            products.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginTop: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                    {p.weight_lbs ? `${Number(p.weight_lbs).toFixed(1)} lb · ` : ''}
                    {p.case_cost != null ? `case $${Number(p.case_cost).toFixed(2)}` : ''}
                    {p.unit_cost != null ? ` · $${Number(p.unit_cost).toFixed(2)}/lb` : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontWeight: 800,
                    padding: '4px 8px',
                    borderRadius: 999,
                    background:
                      p.status === 'live' ? GREEN :
                      p.status === 'pending' ? GOLD_BRIGHT : TEXT_DIM,
                    color: NAVY,
                  }}
                >
                  {p.status || '—'}
                </span>
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

/* primitives */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#fff' }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: TEXT_DIM, fontWeight: 700, textTransform: 'uppercase', margin: '8px 0 4px' }}>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: TEXT_DIM, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || GOLD_BRIGHT, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function round4(n: number) { return Math.round(n * 10000) / 10000; }

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: `1.5px solid ${BORDER}`,
  color: '#fff',
  fontSize: 13,
  marginBottom: 8,
  boxSizing: 'border-box',
  outline: 'none',
};
