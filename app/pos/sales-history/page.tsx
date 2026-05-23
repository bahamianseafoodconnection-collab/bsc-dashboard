'use client';

// app/pos/sales-history/page.tsx
//
// Cashier-facing list of POS sales (Nassau + Andros), filterable by
// location and date range. Reads orders.order_type IN ('pos_sale_nassau',
// 'pos_sale_andros') and shows total + payment + customer + items count
// for each. The print-friendly receipt is one click away.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { countOrderItems } from '@/lib/order-items';

export const dynamic = 'force-dynamic';

type Order = {
  id: string;
  created_at: string;
  order_type: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: number | null;
  wholesale_cost_total: number | null;
  wholesale_items: unknown;
};

type Filter = 'all' | 'nassau' | 'andros';
type DateRange = 'today' | '7d' | '30d' | 'all';

const POS_TYPES = ['pos_sale_nassau', 'pos_sale_andros'];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createBrowserClient(url, key);
}

function startOfRange(r: DateRange): string | null {
  if (r === 'all') return null;
  const d = new Date();
  if (r === 'today') d.setHours(0, 0, 0, 0);
  if (r === '7d')    d.setDate(d.getDate() - 7);
  if (r === '30d')   d.setDate(d.getDate() - 30);
  return d.toISOString();
}


export default function PosSalesHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [range, setRange] = useState<DateRange>('today');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      let q = supabase
        .from('orders')
        .select('id, created_at, order_type, status, payment_status, payment_method, customer_name, customer_phone, total, wholesale_cost_total, wholesale_items')
        .in('order_type', POS_TYPES)
        .order('created_at', { ascending: false })
        .limit(500);
      const start = startOfRange(range);
      if (start) q = q.gte('created_at', start);
      const { data, error: err } = await q;
      if (err) throw err;
      setOrders((data || []) as Order[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [range]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filter === 'nassau' && o.order_type !== 'pos_sale_nassau') return false;
      if (filter === 'andros' && o.order_type !== 'pos_sale_andros') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [o.customer_name, o.customer_phone, o.id, o.payment_method].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  const totals = useMemo(() => {
    let revenue = 0;
    let nassau = 0;
    let andros = 0;
    for (const o of filtered) {
      const t = Number(o.total ?? o.wholesale_cost_total ?? 0);
      revenue += t;
      if (o.order_type === 'pos_sale_nassau') nassau += 1;
      if (o.order_type === 'pos_sale_andros') andros += 1;
    }
    return { revenue, nassau, andros, count: filtered.length };
  }, [filtered]);

  return (
    <div style={pgStyle}>
      <Link href="/pos" style={backStyle}>← Register</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Sales history
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Every Nassau + Andros POS sale, filterable.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Stat label="Sales"       value={totals.count}                            accent="#f5c518" />
        <Stat label="Revenue"     value={`$${totals.revenue.toFixed(2)}`}         accent="#22c55e" />
        <Stat label="Nassau"      value={totals.nassau}                           accent="#1a6fb5" />
        <Stat label="Andros"      value={totals.andros}                           accent="#a78bfa" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {(['today', '7d', '30d', 'all'] as DateRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              ...pillStyle,
              background: range === r ? '#f5c518' : '#0d1f3c',
              color: range === r ? '#060d1f' : '#cbd5e1',
              border: range === r ? 'none' : '1px solid #1e3a5f',
            }}
          >
            {r === 'today' ? 'Today' : r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'All time'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {(['all', 'nassau', 'andros'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...pillStyle,
              background: filter === f ? '#1a2e5a' : '#0d1f3c',
              color: filter === f ? '#f5c518' : '#cbd5e1',
              border: filter === f ? '1px solid #f5c518' : '1px solid #1e3a5f',
            }}
          >
            {f === 'all' ? 'All POS' : f === 'nassau' ? 'Nassau' : 'Andros'}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search customer, phone, payment, ID…"
        style={inputStyle}
      />

      {error && <ErrorBox text={error} />}

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 16, textAlign: 'center' }}>
          {orders.length === 0
            ? 'No POS sales in this date range yet.'
            : 'No sales match those filters.'}
        </div>
      )}

      {filtered.map((o) => {
        const total = Number(o.total ?? o.wholesale_cost_total ?? 0);
        const tone = o.order_type === 'pos_sale_andros' ? '#a78bfa' : '#1a6fb5';
        const pm   = (o.payment_method || '').toLowerCase();
        const ts   = new Date(o.created_at);
        const items = countOrderItems(o.wholesale_items);
        return (
          <div key={o.id} style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {o.customer_name || 'Walk-in'} <span style={{ color: '#94a3b8' }}>· #{o.id.slice(0, 8)}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {o.customer_phone && ` · ${o.customer_phone}`}
                </div>
              </div>
              <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: tone }}>
                {o.order_type === 'pos_sale_andros' ? 'Andros' : 'Nassau'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                {items} item{items === 1 ? '' : 's'}
                {pm && ` · ${pm.toUpperCase()}`}
                {o.payment_status && ` · ${o.payment_status}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#22c55e' }}>
                  BSD ${total.toFixed(2)}
                </span>
                <Link href={`/receipt/${o.id}`} target="_blank" style={miniBtn('#cbd5e1')}>
                  Receipt
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  };
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 760, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const pillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
