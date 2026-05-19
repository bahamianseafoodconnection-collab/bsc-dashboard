'use client';

// /dashboard/ar-aging/statement/[customerId]
//
// Customer statement — every unpaid account-credit invoice on a single
// printable document. Uses window.print() so the operator can "Save as
// PDF" or print to paper. Matches the visual style of /receipt for
// brand consistency.

import { useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface CustomerRow {
  id:            string;
  full_name:     string | null;
  phone:         string | null;
  phone_e164:    string | null;
  email:         string | null;
}

interface UnpaidOrder {
  id:               string;
  created_at:       string;
  total:            number;
  channel:          string | null;
  location:         string | null;
  wholesale_items:  unknown;
  age_days:         number;
  bucket:           '0-30' | '31-60' | '61-90' | '90+';
}

interface LineItem {
  name?:        string;
  quantity?:    number;
  weight_lb?:   number | null;
  unit_price?:  number;
  line_total?:  number;
}

function parseItems(raw: unknown): LineItem[] {
  if (Array.isArray(raw)) return raw as LineItem[];
  if (typeof raw === 'string') { try { return JSON.parse(raw) as LineItem[]; } catch { return []; } }
  return [];
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dueDate30(): string {
  const d = new Date(); d.setDate(d.getDate() + 30);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function StatementPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = usePromise(params);
  const [authed,   setAuthed]   = useState<boolean | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [orders,   setOrders]   = useState<UnpaidOrder[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/ar-aging'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);

      const [{ data: c }, { data: o }] = await Promise.all([
        supabase.from('customers').select('id, full_name, phone, phone_e164, email').eq('id', customerId).maybeSingle(),
        supabase.from('ar_unpaid_orders').select('id, created_at, total, channel, location, age_days, bucket').eq('customer_id', customerId).order('created_at', { ascending: true }),
      ]);

      if (!c) { setErr('Customer not found.'); setLoading(false); return; }
      setCustomer(c as CustomerRow);

      // Refetch the orders with wholesale_items (view doesn't expose JSONB).
      if (o && o.length > 0) {
        const ids = o.map(r => r.id);
        const { data: full } = await supabase
          .from('orders')
          .select('id, wholesale_items')
          .in('id', ids);
        const itemsById = new Map<string, unknown>();
        for (const r of (full ?? []) as { id: string; wholesale_items: unknown }[]) itemsById.set(r.id, r.wholesale_items);
        setOrders(o.map(row => ({
          ...row as UnpaidOrder,
          wholesale_items: itemsById.get(row.id) ?? null,
        })));
      }
      setLoading(false);
    })();
  }, [customerId]);

  const aging = useMemo(() => {
    const acc = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
    for (const o of orders) {
      acc[o.bucket] += Number(o.total);
      acc.total     += Number(o.total);
    }
    return acc;
  }, [orders]);

  if (authed === null || loading) return <Centered>Loading statement…</Centered>;
  if (err)      return <Centered>⚠ {err}</Centered>;
  if (!customer) return <Centered>Customer not found.</Centered>;

  const statementNo = `STMT-${customer.id.slice(0, 8).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const phone = customer.phone || customer.phone_e164 || '—';

  return (
    <div className="statement-page" style={pgStyle}>
      <div className="no-print" style={topBarStyle}>
        <Link href="/dashboard/ar-aging" style={{ color: '#f5c518', textDecoration: 'none', fontSize: 13 }}>← AR Aging</Link>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 13 }}>Statement for {customer.full_name}</span>
        <button onClick={() => window.print()} style={printBtnStyle}>🖨 Print / Save as PDF</button>
      </div>

      <div className="statement-card" style={cardStyle}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #1a2e5a', paddingBottom: 14, marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place"
            style={{ height: 110, width: 'auto', display: 'block', margin: '0 auto' }} />
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.4 }}>
            Epic Plaza, Fire Trail Rd, Nassau, New Providence, Bahamas
          </div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
            Mobile: 242-822-6180 &nbsp;·&nbsp; TIN# 111392634
          </div>
        </div>

        {/* Statement title strip */}
        <div style={{ background: '#1a2e5a', color: '#f5c518', padding: '10px 14px', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>STATEMENT</span>
          <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{statementNo}</span>
        </div>

        <div style={metaRowStyle}>
          <div>
            <div style={metaLabel}>Issued</div>
            <div style={metaValue}>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div>
            <div style={metaLabel}>Account</div>
            <div style={{ ...metaValue, fontFamily: 'monospace', fontSize: 13 }}>{customer.id.slice(0, 13)}…</div>
          </div>
          <div>
            <div style={metaLabel}>Due by</div>
            <div style={{ ...metaValue, color: '#9b1c1c' }}>{dueDate30()}</div>
          </div>
        </div>

        {/* Bill To */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Bill to</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a2e5a' }}>{customer.full_name || '(unnamed customer)'}</div>
          <div style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>📱 {phone}</div>
          {customer.email && (
            <div style={{ fontSize: 14, color: '#475569', marginTop: 2 }}>✉ {customer.email}</div>
          )}
        </div>

        {/* Aging summary */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Aging summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={agingTh}>Bucket</th>
                <th style={{ ...agingTh, textAlign: 'right' }}>Amount (BSD)</th>
              </tr>
            </thead>
            <tbody>
              <AgingRow label="Current (0-30 days)"  value={aging['0-30']}  color="#0f7a3f" />
              <AgingRow label="31-60 days overdue"   value={aging['31-60']} color="#b45309" />
              <AgingRow label="61-90 days overdue"   value={aging['61-90']} color="#c2410c" />
              <AgingRow label="Over 90 days overdue" value={aging['90+']}   color="#9b1c1c" bold />
              <tr style={{ borderTop: '2px solid #1a2e5a' }}>
                <td style={{ ...agingTd, fontWeight: 900, color: '#1a2e5a' }}>TOTAL DUE</td>
                <td style={{ ...agingTd, textAlign: 'right', fontWeight: 900, color: '#1a2e5a', fontSize: 18 }}>${aging.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Invoices */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Unpaid invoices ({orders.length})</div>
          {orders.length === 0 ? (
            <p style={{ fontSize: 13, color: '#475569' }}>No outstanding invoices — account is paid in full.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                  <th style={invoiceTh}>Date</th>
                  <th style={invoiceTh}>Invoice #</th>
                  <th style={invoiceTh}>Items</th>
                  <th style={{ ...invoiceTh, textAlign: 'right' }}>Age</th>
                  <th style={{ ...invoiceTh, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const items = parseItems(o.wholesale_items);
                  const itemPreview = items.length === 0
                    ? '—'
                    : items.slice(0, 2).map(it => `${it.quantity ?? it.weight_lb ?? ''} ${it.name ?? ''}`.trim()).join(', ') + (items.length > 2 ? `, +${items.length - 2} more` : '');
                  const ageColor = o.age_days > 90 ? '#9b1c1c' : o.age_days > 60 ? '#c2410c' : o.age_days > 30 ? '#b45309' : '#0f7a3f';
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={invoiceTd}>{fmtDate(o.created_at)}</td>
                      <td style={{ ...invoiceTd, fontFamily: 'monospace', fontSize: 12 }}>INV-{o.id.slice(0, 8).toUpperCase()}</td>
                      <td style={{ ...invoiceTd, color: '#475569' }}>{itemPreview}</td>
                      <td style={{ ...invoiceTd, textAlign: 'right', color: ageColor, fontWeight: 700 }}>{o.age_days}d</td>
                      <td style={{ ...invoiceTd, textAlign: 'right', fontWeight: 700 }}>${Number(o.total).toFixed(2)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} style={{ ...invoiceTd, textAlign: 'right', fontWeight: 800, color: '#1a2e5a' }}>BALANCE DUE</td>
                  <td style={{ ...invoiceTd, textAlign: 'right', fontWeight: 900, color: '#1a2e5a', fontSize: 16 }}>${aging.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Payment instructions */}
        <div style={{ ...sectionStyle, background: '#fffbeb', border: '1px solid #f5c518', borderRadius: 8, padding: 12 }}>
          <div style={{ ...sectionLabel, color: '#92400e', marginBottom: 8 }}>Payment instructions</div>
          <div style={{ fontSize: 13, color: '#1a2e5a', lineHeight: 1.6 }}>
            <strong>Cash · Card · Wire · Check accepted.</strong><br />
            Please reference your invoice number(s) when paying. For wire transfers, contact us for current bank details. Payment is due within <strong>30 days of issue</strong>.<br /><br />
            Questions? Reach us at <strong>242-822-6180</strong> or <strong>admin@bscbahamas.com</strong>.
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px dashed #cbd5e1' }}>
          Statement generated {new Date().toLocaleString()} · Bahamian Seafood Connection
        </div>
      </div>

      {/* Print styles — hide nav, white bg, no shadows */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .statement-page { background: #fff !important; padding: 0 !important; }
          .statement-card { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 16px !important; max-width: 100% !important; }
          tr, table, td, th { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

function AgingRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
      <td style={agingTd}>{label}</td>
      <td style={{ ...agingTd, textAlign: 'right', color, fontWeight: bold ? 800 : 600 }}>
        {value > 0 ? `$${value.toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}
      </td>
    </tr>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontFamily: 'system-ui' }}>{children}</div>;
}

const pgStyle: React.CSSProperties = {
  background: '#e2e8f0', minHeight: '100vh', padding: '20px 12px', fontFamily: "'DM Sans', system-ui, sans-serif",
};
const topBarStyle: React.CSSProperties = {
  maxWidth: 720, margin: '0 auto 12px', background: '#0b1628', color: '#f5c518',
  padding: '10px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
};
const printBtnStyle: React.CSSProperties = {
  background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 12,
};
const cardStyle: React.CSSProperties = {
  background: '#fff', maxWidth: 720, margin: '0 auto', borderRadius: 12, padding: 24,
  boxShadow: '0 10px 30px -10px rgba(0,0,0,0.25)', color: '#1a2e5a',
};
const metaRowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16, fontSize: 13,
};
const metaLabel: React.CSSProperties = {
  fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 2,
};
const metaValue: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: '#1a2e5a',
};
const sectionStyle: React.CSSProperties = {
  marginBottom: 18,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800, marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 4,
};
const agingTh: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
};
const agingTd: React.CSSProperties = {
  padding: '8px 10px', fontSize: 14, color: '#1a2e5a',
};
const invoiceTh: React.CSSProperties = {
  padding: '8px 8px', fontSize: 10, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left',
};
const invoiceTd: React.CSSProperties = {
  padding: '8px 8px', fontSize: 13, color: '#1a2e5a',
};
