'use client';

// /dashboard/ar-aging/trends — per-customer payment behavior.
//
// Aggregates all account-credit orders (paid + unpaid) over a date
// window and shows each customer's payment habits: # invoices, $
// billed, $ paid, current outstanding, average days from invoice →
// paid, oldest unpaid age, # of times an invoice closed past 60 days.
//
// The goal: surface chronic late payers, the cleanest payers, and
// who's drifting before they cross 90 days.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);
const LATE_THRESHOLD_DAYS = 60;

interface AccountOrder {
  id:                     string;
  created_at:             string;
  total:                  number;
  customer_id:            string | null;
  customer_name:          string | null;
  customer_phone:         string | null;
  payment_status:         string | null;
  payment_received_at:    string | null;
  payment_received_method: string | null;
}

interface CustomerBehavior {
  customer_id:         string | null;
  customer_name:       string;
  customer_phone:      string | null;
  invoice_count:       number;
  billed_total:        number;
  paid_total:          number;
  outstanding_total:   number;
  avg_days_to_pay:     number | null;
  oldest_unpaid_age:   number | null;
  late_paid_count:     number;   // invoices that took >60d to pay
  chronic_score:       number;   // 0-100, higher = worse
}

function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

function dollars(n: number): string {
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

export default function ArTrendsPage() {
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [orders,  setOrders]  = useState<AccountOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo,  setDateTo]  = useState(new Date().toISOString().slice(0, 10));
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/ar-aging/trends'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, []);

  useEffect(() => { if (authed) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authed, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id, created_at, total, customer_id, customer_name, customer_phone, payment_status, payment_received_at, payment_received_method')
      .eq('payment_method', 'account')
      .eq('status', 'completed')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as AccountOrder[]);
    setLoading(false);
  }

  const behaviors: CustomerBehavior[] = useMemo(() => {
    const now = new Date().toISOString();
    const map = new Map<string, CustomerBehavior & { paid_days_total: number; paid_days_count: number }>();
    for (const o of orders) {
      const key = o.customer_id ?? `phone:${o.customer_phone ?? 'unknown'}::${o.customer_name ?? 'unknown'}`;
      const existing = map.get(key);
      const row = existing ?? {
        customer_id:        o.customer_id,
        customer_name:      o.customer_name ?? '(walk-in)',
        customer_phone:     o.customer_phone,
        invoice_count:      0,
        billed_total:       0,
        paid_total:         0,
        outstanding_total:  0,
        avg_days_to_pay:    null,
        oldest_unpaid_age:  null,
        late_paid_count:    0,
        chronic_score:      0,
        paid_days_total:    0,
        paid_days_count:    0,
      };
      const isPaid = o.payment_status === 'paid_in_full';
      row.invoice_count += 1;
      row.billed_total  += Number(o.total);
      if (isPaid) {
        row.paid_total += Number(o.total);
        if (o.payment_received_at) {
          const d = daysBetween(o.created_at, o.payment_received_at);
          row.paid_days_total += d;
          row.paid_days_count += 1;
          if (d > LATE_THRESHOLD_DAYS) row.late_paid_count += 1;
        }
      } else {
        row.outstanding_total += Number(o.total);
        const age = daysBetween(o.created_at, now);
        if (row.oldest_unpaid_age === null || age > row.oldest_unpaid_age) row.oldest_unpaid_age = age;
      }
      map.set(key, row);
    }

    return Array.from(map.values()).map(r => {
      r.avg_days_to_pay = r.paid_days_count > 0 ? Math.round(r.paid_days_total / r.paid_days_count) : null;
      // Chronic score: weighted by late-paid ratio + current outstanding + oldest unpaid age.
      const lateRatio   = r.invoice_count > 0 ? r.late_paid_count / r.invoice_count : 0;
      const overdueRisk = r.oldest_unpaid_age ? Math.min(1, r.oldest_unpaid_age / 120) : 0;
      const slowPay     = r.avg_days_to_pay && r.avg_days_to_pay > 30 ? Math.min(1, (r.avg_days_to_pay - 30) / 60) : 0;
      r.chronic_score   = Math.round((lateRatio * 50) + (overdueRisk * 30) + (slowPay * 20));
      return r as CustomerBehavior;
    }).sort((a, b) => b.outstanding_total - a.outstanding_total || b.chronic_score - a.chronic_score);
  }, [orders]);

  const filtered = useMemo(() => {
    if (!search.trim()) return behaviors;
    const q = search.toLowerCase();
    return behaviors.filter(b =>
      b.customer_name.toLowerCase().includes(q) ||
      (b.customer_phone ?? '').toLowerCase().includes(q)
    );
  }, [behaviors, search]);

  const totals = useMemo(() => behaviors.reduce((a, b) => ({
    customers:   a.customers   + 1,
    invoices:    a.invoices    + b.invoice_count,
    billed:      a.billed      + b.billed_total,
    paid:        a.paid        + b.paid_total,
    outstanding: a.outstanding + b.outstanding_total,
    late:        a.late        + b.late_paid_count,
  }), { customers: 0, invoices: 0, billed: 0, paid: 0, outstanding: 0, late: 0 }), [behaviors]);

  function downloadCsv() {
    const headers = ['Customer','Phone','Invoices','Billed','Paid','Outstanding','Avg days to pay','Oldest unpaid (days)','# paid late (>60d)','Chronic score (0-100)'];
    const lines = behaviors.map(b => [
      b.customer_name, b.customer_phone ?? '',
      b.invoice_count, b.billed_total.toFixed(2), b.paid_total.toFixed(2),
      b.outstanding_total.toFixed(2),
      b.avg_days_to_pay ?? '—',
      b.oldest_unpaid_age ?? '—',
      b.late_paid_count, b.chronic_score,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = `bsc-ar-trends-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function scoreColor(s: number): string {
    if (s >= 60) return '#f87171';
    if (s >= 30) return '#fb923c';
    if (s >= 10) return '#fbbf24';
    return '#4ade80';
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/dashboard/ar-aging" style={back}>← AR aging</Link>
          <h1 style={h1}>📈 Payment behavior — by customer</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            All account-credit orders (paid + unpaid) · invoiced {dateFrom} → {dateTo} · {behaviors.length} customer{behaviors.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or phone…"
            style={{ flex: '1 1 240px', padding: '8px 12px', borderRadius: 8, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14 }} />
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>From <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInput} /></label>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>To <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInput} /></label>
          <button onClick={downloadCsv} disabled={behaviors.length === 0}
            style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            ⬇ CSV
          </button>
        </div>

        <div style={statGrid}>
          <Stat label="Customers"     value={totals.customers.toString()}     accent="#f5c518" />
          <Stat label="Invoices"      value={totals.invoices.toString()}      accent="#a78bfa" />
          <Stat label="Billed"        value={dollars(totals.billed)}          accent="#60a5fa" />
          <Stat label="Paid"          value={dollars(totals.paid)}            accent="#4ade80" />
          <Stat label="Outstanding"   value={dollars(totals.outstanding)}     accent="#fb923c" />
          <Stat label="Paid late"     value={totals.late.toString()}          accent="#f87171" />
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>Loading…</p>}
        {!loading && filtered.length === 0 && <div style={empty}>No account-credit invoices in this window.</div>}

        {filtered.length > 0 && (
          <div style={{ marginTop: 14, overflow: 'auto', borderRadius: 12, border: '1px solid rgba(245,197,24,0.15)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1020 }}>
              <thead style={{ background: '#0b1628' }}>
                <tr>
                  <th style={th}>Customer</th>
                  <th style={{ ...th, textAlign: 'right' }}>Invoices</th>
                  <th style={{ ...th, textAlign: 'right' }}>Billed</th>
                  <th style={{ ...th, textAlign: 'right' }}>Paid</th>
                  <th style={{ ...th, textAlign: 'right' }}>Outstanding</th>
                  <th style={{ ...th, textAlign: 'right' }}>Avg days to pay</th>
                  <th style={{ ...th, textAlign: 'right' }}>Oldest unpaid</th>
                  <th style={{ ...th, textAlign: 'right' }}>Paid late (&gt;60d)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Chronic score</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={(b.customer_id ?? b.customer_name) + i} style={{ background: i % 2 === 0 ? '#060d1f' : '#0a1628' }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, color: '#fff' }}>{b.customer_name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{b.customer_phone ?? '—'}</div>
                    </td>
                    <td style={td}>{b.invoice_count}</td>
                    <td style={td}>${b.billed_total.toFixed(2)}</td>
                    <td style={{ ...td, color: '#4ade80' }}>${b.paid_total.toFixed(2)}</td>
                    <td style={{ ...td, color: b.outstanding_total > 0 ? '#fb923c' : 'rgba(255,255,255,0.3)', fontWeight: b.outstanding_total > 0 ? 800 : 400 }}>
                      {b.outstanding_total > 0 ? `$${b.outstanding_total.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ ...td, color: b.avg_days_to_pay === null ? 'rgba(255,255,255,0.3)' : b.avg_days_to_pay > 60 ? '#f87171' : b.avg_days_to_pay > 30 ? '#fbbf24' : '#4ade80' }}>
                      {b.avg_days_to_pay === null ? '—' : `${b.avg_days_to_pay}d`}
                    </td>
                    <td style={{ ...td, color: b.oldest_unpaid_age === null ? 'rgba(255,255,255,0.3)' : b.oldest_unpaid_age > 90 ? '#f87171' : b.oldest_unpaid_age > 60 ? '#fb923c' : '#fbbf24' }}>
                      {b.oldest_unpaid_age === null ? '—' : `${b.oldest_unpaid_age}d`}
                    </td>
                    <td style={{ ...td, color: b.late_paid_count > 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>{b.late_paid_count || '—'}</td>
                    <td style={{ ...td }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: `${scoreColor(b.chronic_score)}22`, color: scoreColor(b.chronic_score), fontWeight: 800 }}>
                        {b.chronic_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12, lineHeight: 1.6 }}>
          <strong>Chronic score:</strong> 0-100 composite of (late-paid ratio × 50) + (oldest-unpaid risk × 30) + (slow-pay-vs-30d × 20).
          <span style={{ color: '#4ade80' }}> 0-9 clean</span> · <span style={{ color: '#fbbf24' }}>10-29 watch</span> · <span style={{ color: '#fb923c' }}>30-59 problem</span> · <span style={{ color: '#f87171' }}>60+ chronic</span>.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const empty: React.CSSProperties = { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12, marginTop: 16 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 };
const dateInput: React.CSSProperties = { background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '4px 8px', fontSize: 12, marginLeft: 6 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 10px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(245,197,24,0.15)' };
const td: React.CSSProperties = { padding: '10px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', textAlign: 'right', color: '#fff' };
