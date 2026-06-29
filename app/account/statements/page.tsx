'use client';

// app/account/statements/page.tsx  (G10)
//
// Customer-facing statements + balance. Self-service AR view for credit /
// commercial customers: outstanding balance, invoices (DUE/OVERDUE),
// payments received, and downloadable saved statements. Data is scoped to
// the signed-in customer by /api/account/statements (service-role).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Inv = { id: string; invoice_number: string | null; invoice_date: string; due_date: string | null; amount_total: number; allocated: number; balance: number; status: string };
type Pay = { id: string; payment_date: string; amount: number; payment_method: string | null; reference: string | null };
type Stmt = { id: string; period_end: string; total_outstanding: number; status: string; pdf_url: string | null };
type Data = { ok: boolean; is_credit: boolean; balance: number; credit_limit: number; available: number; account_status: string; invoices: Inv[]; payments: Pay[]; statements: Stmt[] };

const money = (n: number | null) => `$${Number(n ?? 0).toFixed(2)}`;
function fmt(s: string | null) { if (!s) return '—'; const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
const statusColor = (s: string) => s === 'OVERDUE' ? '#dc2626' : s === 'DUE' ? '#d97706' : s === 'PAID' || s === 'CURRENT' ? '#16a34a' : '#1a2e5a';

export default function AccountStatementsPage() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login?next=/account/statements'); return; }
      const res = await fetch('/api/account/statements', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const j = await res.json().catch(() => null);
      setD(j && j.ok ? j as Data : null);
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <Center>Loading your statement…</Center>;
  if (!d) return <Center>Could not load your statement.</Center>;

  const hasActivity = d.invoices.length > 0 || d.payments.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f2ee', fontFamily: "'Inter', system-ui, sans-serif", color: '#1a2e5a', padding: 16 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Statements &amp; Balance</h1>
          <Link href="/account" style={pill}>← Account</Link>
        </div>

        {/* Balance summary */}
        <div style={{ ...card, background: '#0b1628', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>Outstanding balance</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: '#f5c518' }}>{money(d.balance)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: statusColor(d.account_status), padding: '3px 10px', borderRadius: 6 }}>{d.account_status}</span>
              {d.is_credit && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Limit {money(d.credit_limit)} · Available {money(d.available)}</div>}
            </div>
          </div>
        </div>

        {!hasActivity && <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>No invoices or payments on your account yet.</div>}

        {/* Invoices */}
        {d.invoices.length > 0 && (
          <div style={card}>
            <h2 style={h2}>Invoices</h2>
            <table style={table}>
              <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Due</Th><Th right>Amount</Th><Th right>Paid</Th><Th right>Balance</Th></tr></thead>
              <tbody>
                {d.invoices.map((i) => (
                  <tr key={i.id} style={{ borderTop: '1px solid #eee' }}>
                    <Td><span style={{ fontFamily: 'monospace' }}>{i.invoice_number || i.id.slice(0, 8)}</span> <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: statusColor(i.status) }}>{i.status}</span></Td>
                    <Td>{fmt(i.invoice_date)}</Td><Td>{fmt(i.due_date)}</Td>
                    <Td right>{money(i.amount_total)}</Td><Td right style={{ color: '#16a34a' }}>{money(i.allocated)}</Td>
                    <Td right bold>{money(i.balance)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payments */}
        {d.payments.length > 0 && (
          <div style={card}>
            <h2 style={h2}>Payments received</h2>
            <table style={table}>
              <thead><tr><Th>Date</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th></tr></thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                    <Td>{fmt(p.payment_date)}</Td><Td>{(p.payment_method || '—').replace(/_/g, ' ')}</Td><Td>{p.reference || '—'}</Td>
                    <Td right bold style={{ color: '#16a34a' }}>{money(p.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Saved statements */}
        {d.statements.length > 0 && (
          <div style={card}>
            <h2 style={h2}>Statements</h2>
            {d.statements.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #eee' }}>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>Statement — {fmt(s.period_end)}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Outstanding {money(s.total_outstanding)}</div></div>
                {s.pdf_url ? <a href={s.pdf_url} target="_blank" rel="noreferrer" style={{ ...pill, background: '#1a2e5a', color: '#f5c518', borderColor: '#1a2e5a' }}>⬇ PDF</a> : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>Questions about your account? WhatsApp / call 242-361-3474.</div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) { return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>; }
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) { return <th style={{ textAlign: right ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', padding: '4px 6px', fontWeight: 800 }}>{children}</th>; }
function Td({ children, right, bold, style }: { children: React.ReactNode; right?: boolean; bold?: boolean; style?: React.CSSProperties }) { return <td style={{ textAlign: right ? 'right' : 'left', fontSize: 13, padding: '7px 6px', fontWeight: bold ? 800 : 400, ...style }}>{children}</td>; }

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e7e3da', borderRadius: 12, padding: 16, marginBottom: 12 };
const pill: React.CSSProperties = { fontSize: 13, textDecoration: 'none', border: '1px solid #d6d0c4', borderRadius: 8, padding: '7px 12px', color: '#1a2e5a' };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#475569', margin: '0 0 8px' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
