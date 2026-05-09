'use client';

// app/pulse/page.tsx
//
// Live operations pulse for BSC. Single-glance answer to "what's
// happening today?" — today's revenue per channel, open orders by
// status, low-stock alerts, today's promo redemptions + new customers,
// and a recent-orders ticker. Auto-refreshes every 30 seconds.
//
// Distinct from /reports (historical analysis with date ranges) and
// /pickup-queue (per-order fulfillment view). This is the cockpit.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const REFRESH_MS = 30_000;

type Order = {
  id: string;
  created_at: string;
  order_type: string | null;
  status: string | null;
  payment_status: string | null;
  customer_name: string | null;
  total: number | null;
  wholesale_cost_total: number | null;
  delivery_type: string | null;
  promo_code: string | null;
  promo_discount: number | null;
  wholesale_items: unknown;
};

type LowStockRow = {
  product_id: string;
  quantity: number;
  product?: { name: string; category: string | null } | null;
};

type RedemptionRow = {
  id: string;
  created_at: string;
  promo_code: string;
  applied_amount: number;
};

type CustomerRow = {
  id: string;
  created_at: string;
  name: string | null;
  source: string | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  online_market: 'Online Market',
  pos_nassau:    'Nassau POS',
  pos_andros:    'Andros POS',
  wholesale:     'Wholesale',
  local_wholesale: 'Local Wholesale',
  bill_payments: 'Bill Payments',
};

const TERMINAL = new Set(['Delivered', 'Cancelled']);

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function topItem(raw: unknown): { name: string; qty: number } | null {
  if (!raw) return null;
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items = arr as Array<{ name?: string; qty?: number; quantity?: number }>;
  const totals = new Map<string, number>();
  for (const it of items) {
    if (!it.name) continue;
    totals.set(it.name, (totals.get(it.name) || 0) + Number(it.qty ?? it.quantity ?? 1));
  }
  let best: { name: string; qty: number } | null = null;
  for (const [name, qty] of totals.entries()) {
    if (!best || qty > best.qty) best = { name, qty };
  }
  return best;
}

export default function PulsePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  async function load() {
    setError(null);
    const start = startOfTodayIso();
    try {
      const [oRes, sRes, rRes, cRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, created_at, order_type, status, payment_status, customer_name, total, wholesale_cost_total, delivery_type, promo_code, promo_discount, wholesale_items')
          .gte('created_at', start)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('inventory')
          .select('product_id, quantity, product:products ( name, category )')
          .lte('quantity', 5)
          .order('quantity', { ascending: true })
          .limit(20),
        supabase
          .from('promo_redemptions')
          .select('id, created_at, promo_code, applied_amount')
          .gte('created_at', start)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('customers')
          .select('id, created_at, name, source')
          .gte('created_at', start)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (oRes.error) throw oRes.error;
      setOrders((oRes.data || []) as Order[]);

      // Low stock — silently skip if inventory query fails (no migration yet).
      if (!sRes.error) {
        const norm = ((sRes.data || []) as Array<{
          product_id: string;
          quantity: number;
          product: { name: string; category: string | null } | { name: string; category: string | null }[] | null;
        }>).map((r) => ({
          product_id: r.product_id,
          quantity: Number(r.quantity || 0),
          product: Array.isArray(r.product) ? r.product[0] ?? null : r.product,
        }));
        setLowStock(norm);
      }

      if (!rRes.error) setRedemptions((rRes.data || []) as RedemptionRow[]);
      if (!cRes.error) setCustomers((cRes.data || []) as CustomerRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const channelTotals = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const o of orders) {
      const key = o.order_type || 'unknown';
      const cur = map.get(key) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(o.total ?? o.wholesale_cost_total ?? 0);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, label: CHANNEL_LABEL[key] || key, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const totalToday = useMemo(() => {
    return orders.reduce((s, o) => s + Number(o.total ?? o.wholesale_cost_total ?? 0), 0);
  }, [orders]);

  const openByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const live = o.status || o.payment_status || 'pending';
      if (TERMINAL.has(live)) continue;
      counts[live] = (counts[live] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const topProducts = useMemo(() => {
    const totals = new Map<string, number>();
    for (const o of orders) {
      const t = topItem(o.wholesale_items);
      if (!t) continue;
      totals.set(t.name, (totals.get(t.name) || 0) + t.qty);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [orders]);

  const totalRedemptions = redemptions.reduce((s, r) => s + Number(r.applied_amount || 0), 0);
  const recent = orders.slice(0, 8);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>
          Pulse
        </h1>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          updated {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          <button onClick={load} style={{ marginLeft: 8, background: '#0d1f3c', border: '1px solid #1e3a5f', color: '#cbd5e1', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ↻
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        Auto-refreshes every 30 seconds.
      </div>

      {error && <ErrorBox text={error} />}

      {/* Top stats — today */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Revenue today"  value={`$${totalToday.toFixed(2)}`} accent="#22c55e" />
        <Stat label="Orders today"   value={orders.length}              accent="#f5c518" />
        <Stat label="Open orders"    value={openByStatus.reduce((s, [, n]) => s + n, 0)} accent="#fb923c" />
        <Stat label="New customers"  value={customers.length}           accent="#a78bfa" />
      </div>

      {/* Channel mix */}
      <Section title="Today by channel">
        {loading && orders.length === 0 ? (
          <div style={mutedRow}>Loading…</div>
        ) : channelTotals.length === 0 ? (
          <div style={mutedRow}>No orders yet today.</div>
        ) : (
          channelTotals.map((c) => {
            const share = totalToday > 0 ? c.revenue / totalToday : 0;
            return (
              <div key={c.key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', marginBottom: 4 }}>
                  <span>{c.label} <span style={{ color: '#94a3b8' }}>· {c.count} order{c.count === 1 ? '' : 's'}</span></span>
                  <span style={{ color: '#fff', fontWeight: 800 }}>BSD ${c.revenue.toFixed(2)}</span>
                </div>
                <div style={{ height: 6, background: '#0a1628', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(2, share * 100)}%`, height: '100%', background: '#f5c518', borderRadius: 3 }} />
                </div>
              </div>
            );
          })
        )}
      </Section>

      {/* Open status breakdown */}
      <Section title="Open orders by status">
        {openByStatus.length === 0 ? (
          <div style={mutedRow}>Nothing open — every order today is delivered or cancelled.</div>
        ) : (
          openByStatus.map(([status, n]) => (
            <div key={status} style={statusRow}>
              <span style={{ color: '#cbd5e1' }}>{status}</span>
              <span style={{ color: '#f5c518', fontWeight: 800 }}>{n}</span>
            </div>
          ))
        )}
        <Link href="/pickup-queue" style={ctaLink}>Open the pickup queue →</Link>
      </Section>

      {/* Two-column row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Section title={`Low stock (${lowStock.length})`}>
          {lowStock.length === 0 ? (
            <div style={mutedRow}>Nothing under 5 units.</div>
          ) : (
            lowStock.slice(0, 10).map((r) => {
              const tone = r.quantity === 0 ? '#dc2626' : r.quantity <= 2 ? '#fb923c' : '#f5c518';
              return (
                <div key={r.product_id} style={statusRow}>
                  <span style={{ color: '#cbd5e1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.product?.name || r.product_id.slice(0, 8)}
                  </span>
                  <span style={{ color: tone, fontWeight: 800 }}>{r.quantity}</span>
                </div>
              );
            })
          )}
          <Link href="/inventory" style={ctaLink}>Open inventory →</Link>
        </Section>

        <Section title={`Today's top items`}>
          {topProducts.length === 0 ? (
            <div style={mutedRow}>No item-level data yet.</div>
          ) : (
            topProducts.map(([name, qty]) => (
              <div key={name} style={statusRow}>
                <span style={{ color: '#cbd5e1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </span>
                <span style={{ color: '#f5c518', fontWeight: 800 }}>{qty}</span>
              </div>
            ))
          )}
        </Section>
      </div>

      {/* Promo + customers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Section title={`Promo redemptions (${redemptions.length})`}>
          {redemptions.length === 0 ? (
            <div style={mutedRow}>No codes used today.</div>
          ) : (
            <>
              <div style={{ marginBottom: 8, fontSize: 12, color: '#cbd5e1' }}>
                Discount given today: <span style={{ color: '#22c55e', fontWeight: 800 }}>BSD ${totalRedemptions.toFixed(2)}</span>
              </div>
              {redemptions.slice(0, 6).map((r) => (
                <div key={r.id} style={statusRow}>
                  <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{r.promo_code}</span>
                  <span style={{ color: '#22c55e', fontWeight: 800 }}>−${Number(r.applied_amount).toFixed(2)}</span>
                </div>
              ))}
            </>
          )}
          <Link href="/promos" style={ctaLink}>Promo codes →</Link>
        </Section>

        <Section title={`New customers today (${customers.length})`}>
          {customers.length === 0 ? (
            <div style={mutedRow}>No new sign-ups today.</div>
          ) : (
            customers.slice(0, 8).map((c) => (
              <div key={c.id} style={statusRow}>
                <span style={{ color: '#cbd5e1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name || '(unnamed)'}
                </span>
                <span style={{ color: '#a78bfa', fontWeight: 800, fontSize: 10, textTransform: 'uppercase' }}>
                  {c.source || 'manual'}
                </span>
              </div>
            ))
          )}
          <Link href="/customers" style={ctaLink}>All customers →</Link>
        </Section>
      </div>

      {/* Recent orders ticker */}
      <Section title="Recent orders">
        {recent.length === 0 ? (
          <div style={mutedRow}>Nothing yet today.</div>
        ) : (
          recent.map((o) => {
            const total = Number(o.total ?? o.wholesale_cost_total ?? 0);
            const live = o.status || o.payment_status || 'pending';
            const tone =
              live === 'Delivered'        ? '#22c55e' :
              live === 'Cancelled'        ? '#f87171' :
              live === 'Out for Delivery' ? '#fb923c' :
              live === 'Packing'          ? '#a78bfa' :
              live === 'Confirmed'        ? '#1a6fb5' :
              '#f5c518';
            return (
              <Link key={o.id} href="/orders" style={{ ...statusRow, textDecoration: 'none', cursor: 'pointer' }}>
                <span style={{ color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.customer_name || 'Guest'} <span style={{ color: '#94a3b8' }}>· #{o.id.slice(0, 8)}</span>
                </span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#22c55e', fontWeight: 800 }}>${total.toFixed(2)}</span>
                  <span style={{ color: tone, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{live}</span>
                </span>
              </Link>
            );
          })
        )}
        <Link href="/orders" style={ctaLink}>All orders →</Link>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {children}
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

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 760, margin: '0 auto' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
const statusRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 12, gap: 10 };
const mutedRow: React.CSSProperties = { fontSize: 12, color: '#94a3b8', padding: '4px 0' };
const ctaLink: React.CSSProperties = { display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700, color: '#cbd5e1', textDecoration: 'none', borderTop: '1px dashed #1e3a5f', paddingTop: 6 };
