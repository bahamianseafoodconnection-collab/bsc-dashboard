'use client';

// app/reports/page.tsx
//
// Operational reports + CSV exports. Five reports:
//   1. Sales by day (range)
//   2. Sales by channel (range)
//   3. Expenses by category (range)
//   4. Customer lifetime value (top 50)
//   5. COGS report (orders with cost / margin breakdown)
//
// Each renders inline + has a "Download CSV" button. Date range applies
// to reports 1–3; reports 4–5 are all-time.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type ReportKey = 'sales_by_day' | 'sales_by_channel' | 'expenses_by_category' | 'customer_ltv' | 'cogs';

type Order = {
  id: string;
  created_at: string;
  order_type: string;
  total: number | null;
  wholesale_cost_total: number | null;
};
type Expense = { id: string; category: string; amount_bsd: number; created_at: string; paid_at: string | null };
type Customer = { id: string; name: string; phone: string | null; total_orders: number; total_spent_bsd: number; last_seen_at: string };

const CHANNEL_LABEL: Record<string, string> = {
  pos_sale_nassau: 'Nassau POS',
  pos_sale_andros: 'Andros POS',
  online_market:   'Online market',
  wholesale:       'Wholesale',
};
const CHANNEL_MARGIN: Record<string, number> = {
  pos_sale_nassau: 0.38,
  pos_sale_andros: 0.43,
  online_market:   0.25,
  wholesale:       0.12,
};

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function todayIso() { return isoDate(new Date()); }
function thirtyAgoIso() { const d = new Date(); d.setDate(d.getDate() - 30); return isoDate(d); }

export default function ReportsPage() {
  const [active, setActive] = useState<ReportKey>('sales_by_day');
  const [from, setFrom] = useState(thirtyAgoIso());
  const [to, setTo] = useState(todayIso());

  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ orders?: string; expenses?: string; customers?: string }>({});

  async function load() {
    setLoading(true);
    setErrors({});
    const fromIso = `${from}T00:00:00Z`;
    const toIso = `${to}T23:59:59Z`;
    const [orderRes, expRes, custRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, created_at, order_type, total, wholesale_cost_total')
        .gte('created_at', fromIso).lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('expenses')
        .select('id, category, amount_bsd, created_at, paid_at')
        .gte('created_at', fromIso).lte('created_at', toIso)
        .limit(5000),
      supabase
        .from('customers')
        .select('id, name, phone, total_orders, total_spent_bsd, last_seen_at')
        .order('total_spent_bsd', { ascending: false })
        .limit(50),
    ]);

    const errs: typeof errors = {};
    if (orderRes.error) errs.orders = orderRes.error.message; else setOrders((orderRes.data || []) as Order[]);
    if (expRes.error)   errs.expenses = expRes.error.message; else setExpenses((expRes.data || []) as Expense[]);
    if (custRes.error)  errs.customers = custRes.error.message; else setCustomers((custRes.data || []) as Customer[]);
    setErrors(errs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // re-load when date range changes (debounce-ish via deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // ─── Report data ───
  const salesByDay = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; orders: number }>();
    for (const o of orders) {
      const day = (o.created_at || '').slice(0, 10);
      const rev = Number(o.total ?? o.wholesale_cost_total ?? 0);
      const cost = Number(o.wholesale_cost_total ?? 0);
      const acc = map.get(day) || { revenue: 0, cost: 0, orders: 0 };
      acc.revenue += rev;
      acc.cost += cost;
      acc.orders += 1;
      map.set(day, acc);
    }
    return Array.from(map.entries())
      .map(([day, v]) => ({ day, ...v, profit: v.revenue / 1.10 - v.cost }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [orders]);

  const salesByChannel = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; orders: number; profit: number }>();
    for (const o of orders) {
      const ot = o.order_type || 'unknown';
      const rev = Number(o.total ?? o.wholesale_cost_total ?? 0);
      const cost = Number(o.wholesale_cost_total ?? 0);
      const margin = CHANNEL_MARGIN[ot] ?? 0;
      const profit = (rev / 1.10) * margin;
      const acc = map.get(ot) || { revenue: 0, cost: 0, orders: 0, profit: 0 };
      acc.revenue += rev;
      acc.cost += cost;
      acc.orders += 1;
      acc.profit += profit;
      map.set(ot, acc);
    }
    return Array.from(map.entries())
      .map(([channel, v]) => ({ channel, label: CHANNEL_LABEL[channel] || channel, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { total: number; paid: number; outstanding: number; count: number }>();
    for (const e of expenses) {
      const c = e.category || 'other';
      const amt = Number(e.amount_bsd || 0);
      const acc = map.get(c) || { total: 0, paid: 0, outstanding: 0, count: 0 };
      acc.total += amt;
      acc.count += 1;
      if (e.paid_at) acc.paid += amt; else acc.outstanding += amt;
      map.set(c, acc);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const cogsRows = useMemo(() => {
    return orders.map((o) => {
      const rev = Number(o.total ?? o.wholesale_cost_total ?? 0);
      const cost = Number(o.wholesale_cost_total ?? 0);
      const margin = CHANNEL_MARGIN[o.order_type] ?? 0;
      const grossExclVat = rev / 1.10;
      const profit = grossExclVat * margin;
      const vat = rev - grossExclVat;
      return {
        id: o.id,
        date: (o.created_at || '').slice(0, 10),
        channel: CHANNEL_LABEL[o.order_type] || o.order_type,
        revenue: rev,
        cost_basis: cost,
        vat_collected: vat,
        bsc_profit: profit,
      };
    });
  }, [orders]);

  function downloadCsv(name: string, rows: Record<string, unknown>[]) {
    if (rows.length === 0) {
      alert('No data to export.');
      return;
    }
    const cols = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const csv = [
      cols.join(','),
      ...rows.map((r) => cols.map((c) => escape(r[c])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bsc-${name}-${todayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Reports</h1>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Live aggregates across orders, expenses, customers. Download any
        report as CSV for accounting.
      </p>

      {/* Date range — applies to reports 1–3 + 5 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: '#94a3b8' }}>From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={dateInputStyle} />
        <label style={{ fontSize: 11, color: '#94a3b8' }}>to</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={dateInputStyle} />
        <button
          onClick={() => { setFrom(thirtyAgoIso()); setTo(todayIso()); }}
          style={ghostBtnStyle}
        >Last 30d</button>
        <button
          onClick={() => { const d = new Date(); d.setDate(1); setFrom(isoDate(d)); setTo(todayIso()); }}
          style={ghostBtnStyle}
        >This month</button>
      </div>

      {/* Report tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {(
          [
            ['sales_by_day',         '📅 Sales by day'],
            ['sales_by_channel',     '📊 By channel'],
            ['expenses_by_category', '🧾 Expenses'],
            ['customer_ltv',         '👥 Top customers'],
            ['cogs',                 '💰 COGS'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            style={{
              ...filterPillStyle,
              background: active === k ? '#f5c518' : '#1e2d4a',
              color: active === k ? '#060d1f' : '#cbd5e1',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {errors.orders && <ErrorBox text={`orders: ${errors.orders}`} />}
      {errors.expenses && <ErrorBox text={`expenses: ${errors.expenses}`} />}
      {errors.customers && <ErrorBox text={`customers: ${errors.customers}`} />}

      {/* ─── Render the active report ─── */}

      {active === 'sales_by_day' && (
        <Card
          title={`Sales by day · ${salesByDay.length} day(s)`}
          right={
            <DownloadBtn onClick={() => downloadCsv('sales-by-day', salesByDay)} />
          }
        >
          {salesByDay.length === 0 && !loading ? (
            <Empty />
          ) : (
            <Table
              cols={['Day', 'Orders', 'Revenue', 'Cost basis', 'BSC profit']}
              rows={salesByDay.map((r) => [
                r.day, r.orders, fmt$(r.revenue), fmt$(r.cost), fmt$(r.profit),
              ])}
            />
          )}
        </Card>
      )}

      {active === 'sales_by_channel' && (
        <Card
          title={`Sales by channel · ${salesByChannel.length} channel(s)`}
          right={
            <DownloadBtn onClick={() => downloadCsv('sales-by-channel', salesByChannel)} />
          }
        >
          {salesByChannel.length === 0 && !loading ? (
            <Empty />
          ) : (
            <Table
              cols={['Channel', 'Orders', 'Revenue', 'BSC profit', 'Avg ticket']}
              rows={salesByChannel.map((r) => [
                r.label, r.orders, fmt$(r.revenue), fmt$(r.profit),
                r.orders > 0 ? fmt$(r.revenue / r.orders) : '—',
              ])}
            />
          )}
        </Card>
      )}

      {active === 'expenses_by_category' && (
        <Card
          title={`Expenses by category · ${expensesByCategory.length} categor(ies)`}
          right={
            <DownloadBtn onClick={() => downloadCsv('expenses-by-category', expensesByCategory)} />
          }
        >
          {expensesByCategory.length === 0 && !loading ? (
            <Empty />
          ) : (
            <Table
              cols={['Category', 'Count', 'Total', 'Paid', 'Outstanding']}
              rows={expensesByCategory.map((r) => [
                r.category.replace('_', ' '),
                r.count,
                fmt$(r.total),
                fmt$(r.paid),
                fmt$(r.outstanding),
              ])}
            />
          )}
        </Card>
      )}

      {active === 'customer_ltv' && (
        <Card
          title={`Customer lifetime value · top ${customers.length}`}
          right={
            <DownloadBtn onClick={() => downloadCsv('customer-ltv', customers)} />
          }
        >
          {customers.length === 0 && !loading ? (
            <Empty />
          ) : (
            <Table
              cols={['Customer', 'Phone', 'Orders', 'Lifetime spend', 'Last seen']}
              rows={customers.map((r) => [
                r.name,
                r.phone || '—',
                r.total_orders,
                fmt$(Number(r.total_spent_bsd)),
                r.last_seen_at?.slice(0, 10) || '—',
              ])}
            />
          )}
        </Card>
      )}

      {active === 'cogs' && (
        <Card
          title={`COGS detail · ${cogsRows.length} order(s)`}
          right={
            <DownloadBtn onClick={() => downloadCsv('cogs', cogsRows)} />
          }
        >
          {cogsRows.length === 0 && !loading ? (
            <Empty />
          ) : (
            <Table
              cols={['Date', 'Channel', 'Revenue', 'Cost', 'VAT', 'BSC profit']}
              rows={cogsRows.map((r) => [
                r.date, r.channel,
                fmt$(r.revenue), fmt$(r.cost_basis),
                fmt$(r.vat_collected), fmt$(r.bsc_profit),
              ])}
            />
          )}
        </Card>
      )}
    </div>
  );
}

/* primitives */

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: '#0d1f3c', borderRadius: 12, padding: 14, border: '1px solid #1e3a5f', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: '#f5c518', margin: 0 }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#cbd5e1' }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  borderBottom: '1px solid #1e3a5f',
                  color: '#94a3b8',
                  fontWeight: 700,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DownloadBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#f5c518',
        color: '#060d1f',
        border: 'none',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      ⬇ Download CSV
    </button>
  );
}

function Empty() { return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20, fontSize: 12 }}>No data in range.</div>; }
function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
    </div>
  );
}

function fmt$(n: number) { return `$${Number(n || 0).toFixed(2)}`; }

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const filterPillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const ghostBtnStyle: React.CSSProperties = { background: 'transparent', color: '#cbd5e1', border: '1px solid #1e2d4a', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: 11, cursor: 'pointer' };
const dateInputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 13, outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
