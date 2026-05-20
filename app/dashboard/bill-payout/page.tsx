'use client';

// /dashboard/bill-payout
//
// Bill Casale's sacred 5% gross-profit share, broken out by month.
// orders.bill_casale_share is populated by the per-transaction allocation
// hook on every sale. This page sums it by month, shows lifetime totals,
// last-month and this-month subtotals, and a print-friendly statement.
//
// Founder-only (control_admin / founder / co_founder). Bill himself can
// be sent the statement on demand via the Print button → "Save as PDF"
// → email/WhatsApp out.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder','co_founder','control_admin']);

interface OrderRow {
  id: string; created_at: string; total: number | null;
  bill_casale_share: number | null; order_type: string | null;
  net_profit: number | null;
}
interface MonthAgg {
  ym: string;            // 'YYYY-MM'
  label: string;         // 'May 2026'
  orders: number;
  total_sales: number;
  total_gross_profit: number;   // approximate — see derivation in code
  bill_share: number;
}

function dollars(n: number): string {
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

export default function BillPayoutPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/bill-payout'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !FOUNDER_ROLES.has(prof.role as string)) { window.location.href = '/dashboard'; return; }
      setAuthed(true);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, total, bill_casale_share, order_type, net_profit')
      .not('bill_casale_share', 'is', null)
      .gt('bill_casale_share', 0)
      .order('created_at', { ascending: false })
      .limit(50000);
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setRows((data ?? []) as OrderRow[]);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const months: MonthAgg[] = useMemo(() => {
    const m = new Map<string, MonthAgg>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const cur = m.get(ym) ?? { ym, label, orders: 0, total_sales: 0, total_gross_profit: 0, bill_share: 0 };
      cur.orders      += 1;
      cur.total_sales += Number(r.total ?? 0);
      // bill_share = gross_profit × 5%, so gross_profit ≈ bill_share / 0.05
      cur.bill_share += Number(r.bill_casale_share ?? 0);
      cur.total_gross_profit += Number(r.bill_casale_share ?? 0) / 0.05;
      m.set(ym, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.ym.localeCompare(a.ym));
  }, [rows]);

  const lifetime = useMemo(() => months.reduce((s, x) => s + x.bill_share, 0), [months]);
  const lifetimeSales = useMemo(() => months.reduce((s, x) => s + x.total_sales, 0), [months]);
  const lifetimeOrders = useMemo(() => months.reduce((s, x) => s + x.orders, 0), [months]);
  const thisMonthYm = useMemo(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const lastMonthYm = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const thisMonth = months.find(m => m.ym === thisMonthYm);
  const lastMonth = months.find(m => m.ym === lastMonthYm);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header className="no-print" style={hdr}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <Link href="/dashboard" style={back}>← Dashboard</Link>
            <button onClick={() => window.print()}
              style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              🖨 Print statement
            </button>
          </div>
          <h1 style={h1}>💼 Bill Casale — 5% gross-profit ledger</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Founder-only view. Reads <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>orders.bill_casale_share</code> (set on every sale by the per-transaction allocation hook). Sacred 5% on gross profit — never overridden.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: 16 }}>
        {err && <div style={errBox}>⚠ {err}</div>}
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}

        {!loading && (
          <>
            <div className="print-header" style={printHeader}>
              <div style={{ textAlign: 'center' }}>
                <img src="https://bscbahamas.com/brand/bsc-marketplace-logo.png" alt="BSC" style={{ height: 80, width: 'auto' }} />
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#a16207', textTransform: 'uppercase', marginTop: 6 }}>
                  Bill Casale · 5% gross-profit ledger
                </div>
                <div style={{ fontSize: 14, color: '#1a2e5a', marginTop: 6 }}>
                  Statement generated {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </div>

            <div style={statGrid}>
              <Stat label="Lifetime orders"        value={lifetimeOrders.toString()}             accent="#f5c518" />
              <Stat label="Lifetime sales"         value={dollars(lifetimeSales)}                accent="#f5c518" />
              <Stat label="Lifetime Bill 5%"       value={dollars(lifetime)}                     accent="#4ade80" big />
              <Stat label="This month"             value={dollars(thisMonth?.bill_share ?? 0)}   accent="#60a5fa" />
              <Stat label="Last month"             value={dollars(lastMonth?.bill_share ?? 0)}   accent="#60a5fa" />
            </div>

            <h2 style={sectionH2}>Monthly breakdown</h2>
            {months.length === 0 ? (
              <div style={emptyBox}>No bill_casale_share entries yet — sales with the 5% allocation haven&apos;t closed.</div>
            ) : (
              <div style={{ overflow: 'auto', borderRadius: 10, border: '1px solid rgba(245,197,24,0.15)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: '#0b1628' }}>
                    <tr>
                      <th style={th}>Month</th>
                      <th style={{ ...th, textAlign: 'right' }}>Orders</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total sales</th>
                      <th style={{ ...th, textAlign: 'right' }}>Gross profit (≈)</th>
                      <th style={{ ...th, textAlign: 'right' }}>Bill 5%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m, i) => (
                      <tr key={m.ym} style={{ background: i % 2 === 0 ? '#060d1f' : '#0a1628' }}>
                        <td style={td}>{m.label}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.orders}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{dollars(m.total_sales)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'rgba(255,255,255,0.55)' }}>{dollars(m.total_gross_profit)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>{dollars(m.bill_share)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0b1628' }}>
                      <td style={{ ...td, fontWeight: 800 }}>LIFETIME</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{lifetimeOrders}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{dollars(lifetimeSales)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>{dollars(lifetimeSales > 0 ? lifetime / 0.05 : 0)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 900, color: '#4ade80' }}>{dollars(lifetime)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 14, lineHeight: 1.5 }}>
              Gross profit is derived from <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>bill_casale_share / 0.05</code> — accurate as long as the per-transaction allocation hook fires on every sale. Use <Link href="/dashboard/health" style={{ color: '#f87171' }}>/dashboard/health</Link> to surface any sales missing the share.
            </p>
          </>
        )}
      </main>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        @media screen {
          .print-header { display: none; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent, big }: { label: string; value: string; accent: string; big?: boolean }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: big ? 24 : 18, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const sectionH2: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#f5c518', margin: '18px 0 8px', borderBottom: '1px solid rgba(245,197,24,0.15)', paddingBottom: 4 };
const errBox: React.CSSProperties = { padding: 12, background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, marginBottom: 12 };
const emptyBox: React.CSSProperties = { padding: 24, textAlign: 'center', background: 'rgba(245,197,24,0.05)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 14 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 10px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(245,197,24,0.15)' };
const td: React.CSSProperties = { padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', color: '#fff' };
const printHeader: React.CSSProperties = { marginBottom: 16, padding: 12, background: '#fff', color: '#000', borderRadius: 10 };
