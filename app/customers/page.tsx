'use client';

// app/customers/page.tsx
//
// Customer tracking — reads the public.customers table populated by the
// /api/customers/upsert endpoint. Detail view aggregates the customer's
// orders to surface their buying habits (top items, channel mix, recency).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
  total_orders: number;
  total_spent_bsd: number;
};

type OrderRow = {
  id: string;
  created_at: string;
  order_type: string;
  payment_method: string | null;
  payment_status: string | null;
  wholesale_cost_total: number | null;
  total: number | null;
  wholesale_items: unknown;
};

type LineItem = {
  name: string;
  qty: number;
  unit?: string;
  unit_price?: number;
  line_total?: number;
};

type SortKey = 'spent' | 'visits' | 'recent' | 'name';

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('spent');
  const [selected, setSelected] = useState<CustomerRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('customers')
        .select(
          'id, full_name, phone, email, source, first_seen_at, last_seen_at, total_orders, total_spent_bsd'
        )
        .order('total_spent_bsd', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data || []) as CustomerRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((c) => {
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    });
    out.sort((a, b) => {
      if (sort === 'spent') return Number(b.total_spent_bsd) - Number(a.total_spent_bsd);
      if (sort === 'visits') return b.total_orders - a.total_orders;
      if (sort === 'name') return a.full_name.localeCompare(b.full_name);
      // recent
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });
    return out;
  }, [rows, search, sort]);

  const totalRevenue = rows.reduce((s, c) => s + Number(c.total_spent_bsd || 0), 0);
  const totalOrders = rows.reduce((s, c) => s + Number(c.total_orders || 0), 0);
  const repeatCustomers = rows.filter((c) => c.total_orders > 1).length;
  const avgSpend = rows.length > 0 ? totalRevenue / rows.length : 0;

  if (selected) {
    return (
      <CustomerDetail customer={selected} onBack={() => setSelected(null)} />
    );
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>
        ← BSC Control
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', marginBottom: 4 }}>
        Customers
      </h1>
      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>
        Auto-tracked from POS sales (with phone) and online registrations.
      </p>

      {/* Stat strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label="Total customers" value={String(rows.length)} />
        <Stat label="Repeat (2+ orders)" value={String(repeatCustomers)} />
        <Stat label="Lifetime revenue" value={`BSD $${totalRevenue.toFixed(2)}`} />
        <Stat label="Avg. lifetime spend" value={`BSD $${avgSpend.toFixed(2)}`} />
      </div>

      {/* Search + sort */}
      <input
        type="text"
        placeholder="Search by name, phone, or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {(
          [
            ['spent',  '💰 Top spenders'],
            ['visits', '🔁 Most visits'],
            ['recent', '🕒 Most recent'],
            ['name',   '🔤 A → Z'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: sort === k ? '#f5c518' : '#1e2d4a',
              color: sort === k ? '#060d1f' : '#cbd5e1',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading customers…</p>}

      {!loading && error && (
        <div
          style={{
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid #f87171',
            borderRadius: 12,
            padding: 14,
            color: '#f87171',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          ⚠️ Could not load customers: {error}. If the table doesn&rsquo;t exist
          yet, run sql/2026-05-08-customers.sql in the Supabase SQL editor.
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No customers tracked yet. Once POS sales include a name + phone, or
          someone registers online, they&rsquo;ll appear here automatically.
        </div>
      )}

      {!loading && !error && filtered.length === 0 && rows.length > 0 && (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>
          No matches.
        </div>
      )}

      {filtered.map((c) => (
        <button
          key={c.id}
          onClick={() => setSelected(c)}
          style={{
            ...cardStyle,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            border: '1px solid #1e3a5f',
            background: '#0d1f3c',
            color: '#fff',
            width: '100%',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{c.full_name}</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              {c.phone || c.email || '—'} · {c.source.replace('_', ' ')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 900, color: '#f5c518', fontSize: 14 }}>
              BSD ${Number(c.total_spent_bsd).toFixed(2)}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              {c.total_orders} order{c.total_orders === 1 ? '' : 's'} · last{' '}
              {timeAgo(c.last_seen_at)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── Detail view ─── */

function CustomerDetail({
  customer,
  onBack,
}: {
  customer: CustomerRow;
  onBack: () => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select(
          'id, created_at, order_type, payment_method, payment_status, wholesale_cost_total, total, wholesale_items'
        )
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      setOrders((data || []) as OrderRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  // Aggregate top items across all orders.
  const topItems = useMemo(() => {
    const counts = new Map<string, { name: string; qty: number; spend: number }>();
    for (const o of orders) {
      const items = parseItems(o.wholesale_items);
      for (const it of items) {
        const key = (it.name || '').trim() || 'Unknown';
        const existing = counts.get(key) || { name: key, qty: 0, spend: 0 };
        existing.qty += Number(it.qty || 0);
        existing.spend += Number(it.line_total ?? (it.unit_price || 0) * (it.qty || 0));
        counts.set(key, existing);
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);
  }, [orders]);

  const channelMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      counts.set(o.order_type, (counts.get(o.order_type) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const lifetimeOrders = orders.length;
  const lifetimeSpend = orders.reduce(
    (s, o) => s + Number(o.total ?? o.wholesale_cost_total ?? 0),
    0
  );

  return (
    <div style={pgStyle}>
      <button onClick={onBack} style={backStyle}>
        ← All customers
      </button>

      <div
        style={{
          ...cardStyle,
          background: 'linear-gradient(135deg,#0d1f3c,#1a2e5a)',
          border: '1px solid #f5c518',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>
          {customer.full_name}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
          {customer.phone || '—'}
          {customer.email ? ` · ${customer.email}` : ''}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 6 }}>
          First seen {fmtDate(customer.first_seen_at)} · Last seen{' '}
          {fmtDate(customer.last_seen_at)} · Source {customer.source}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2,1fr)',
            gap: 8,
            marginTop: 14,
          }}
        >
          <Stat label="Lifetime orders" value={String(lifetimeOrders)} />
          <Stat label="Lifetime spend" value={`BSD $${lifetimeSpend.toFixed(2)}`} />
        </div>

        {customer.phone && (
          <a
            href={`https://api.whatsapp.com/send?phone=${normalizePhone(customer.phone)}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block',
              marginTop: 14,
              padding: '8px 14px',
              borderRadius: 8,
              background: '#25D366',
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            💬 WhatsApp customer
          </a>
        )}
      </div>

      {/* Top items */}
      <h3 style={{ color: '#f5c518', fontSize: 14, marginBottom: 8 }}>
        Top items by spend
      </h3>
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading orders…</p>
      ) : topItems.length === 0 ? (
        <div style={{ ...cardStyle, color: '#94a3b8', textAlign: 'center' }}>
          No items yet.
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}>
          {topItems.map((it) => (
            <div
              key={it.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                background: '#0d1f3c',
                border: '1px solid #1e3a5f',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 6,
                color: '#fff',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {it.qty} units total
                </div>
              </div>
              <div
                style={{
                  fontWeight: 900,
                  color: '#f5c518',
                  fontSize: 13,
                }}
              >
                BSD ${it.spend.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Channel mix */}
      {channelMix.length > 0 && (
        <>
          <h3 style={{ color: '#f5c518', fontSize: 14, marginBottom: 8 }}>
            Channel mix
          </h3>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 18,
            }}
          >
            {channelMix.map(([type, n]) => (
              <span
                key={type}
                style={{
                  background: '#1e2d4a',
                  color: '#cbd5e1',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 999,
                }}
              >
                {type.replace('_', ' ')}: {n}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Order history */}
      <h3 style={{ color: '#f5c518', fontSize: 14, marginBottom: 8 }}>
        Order history
      </h3>
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading…</p>
      ) : orders.length === 0 ? (
        <div style={{ ...cardStyle, color: '#94a3b8', textAlign: 'center' }}>
          No orders yet.
        </div>
      ) : (
        orders.map((o) => (
          <div key={o.id} style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {fmtDate(o.created_at)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#f5c518' }}>
                BSD $
                {Number(o.total ?? o.wholesale_cost_total ?? 0).toFixed(2)}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {o.order_type.replace('_', ' ')} ·{' '}
              {o.payment_method || '—'} ·{' '}
              {o.payment_status || '—'}
            </div>
            {(() => {
              const items = parseItems(o.wholesale_items);
              if (items.length === 0) return null;
              return (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: '#cbd5e1',
                    lineHeight: 1.5,
                  }}
                >
                  {items.slice(0, 5).map((it, idx) => (
                    <div key={idx}>
                      • {it.qty} × {it.name}
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div style={{ color: '#64748b' }}>
                      …and {items.length - 5} more
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))
      )}
    </div>
  );
}

/* ─── helpers ─── */

function parseItems(raw: unknown): LineItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw as LineItem[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizePhone(p: string) {
  let raw = p.replace(/\D/g, '');
  if (raw.startsWith('242') && raw.length === 10) raw = '1' + raw;
  else if (raw.length === 7) raw = '1242' + raw;
  else if (!raw.startsWith('1')) raw = '1242' + raw;
  return raw;
}

/* ─── styles ─── */

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
  padding: '11px 14px',
  borderRadius: 10,
  background: '#111c33',
  border: '1px solid #1e2d4a',
  color: '#fff',
  fontSize: 14,
  marginBottom: 10,
  boxSizing: 'border-box',
  outline: 'none',
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#0d1f3c',
        border: '1px solid #1e3a5f',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
