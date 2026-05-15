'use client';

// app/pickup-queue/page.tsx
//
// Staff fulfillment view. Lists every still-open order (today + the
// 48-hour rolling window before it) grouped by delivery destination so
// the warehouse can pack, label, and route a whole batch in one pass.
//
// Groups: Nassau pickup, Nassau delivery, Mailboat → <island>.
// Each group renders printable pack slips with items + customer info,
// plus an "Advance status" action that moves the order to the next step
// in its flow (and fires the customer status notification).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';
import { notifyOrderStatusChange } from '@/lib/notify-status-change';

export const dynamic = 'force-dynamic';

const STATUS_FLOW = ['Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Delivered'];
const PICKUP_FLOW = ['Pending', 'Confirmed', 'Ready for Pickup', 'Delivered'];
const FRESH_WINDOW_HOURS = 48;
const TERMINAL = new Set(['Delivered', 'Cancelled']);

type LineItem = {
  id?: string;
  source?: string;
  sku?: string;
  name?: string;
  qty?: number;
  quantity?: number;
  unit?: string;
  price?: number;
};

type Order = {
  id: string;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_type: string | null;     // 'nassau' | 'mailboat' | 'pickup' | null
  admin_notes: string | null;
  total: number | null;
  wholesale_cost_total: number | null;
  wholesale_items: unknown;
  promo_code?: string | null;
  promo_discount?: number | null;
};

type Group = {
  key: string;
  label: string;
  emoji: string;
  orders: Order[];
};

function parseItems(raw: unknown): LineItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw as LineItem[];
}

function islandFromAdminNotes(notes: string | null): string | null {
  if (!notes) return null;
  // admin_notes looks like "Mailboat to Andros · note" or "Nassau · Andros · note"
  const m = notes.match(/^(?:Mailboat to|Nassau ·)\s*([^·]+)/i);
  return m ? m[1].trim() : null;
}

function groupKeyFor(o: Order): { key: string; label: string; emoji: string } {
  const dt = (o.delivery_type || '').toLowerCase();
  if (dt === 'mailboat') {
    const island = islandFromAdminNotes(o.admin_notes) || 'Family Island';
    return { key: `mailboat::${island}`, label: `🚤 Mailboat → ${island}`, emoji: '🚤' };
  }
  if (dt === 'pickup') {
    return { key: 'pickup', label: '🏪 Nassau pickup', emoji: '🏪' };
  }
  // nassau or null → assume Nassau delivery
  return { key: 'nassau', label: '📍 Nassau delivery', emoji: '📍' };
}

function flowFor(o: Order) {
  return (o.delivery_type || '').toLowerCase() === 'pickup' ? PICKUP_FLOW : STATUS_FLOW;
}

function nextStatus(o: Order): string | null {
  const flow = flowFor(o);
  const cur = o.status || 'Pending';
  const idx = flow.indexOf(cur);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}

export default function PickupQueuePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hideDelivered, setHideDelivered] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    const cutoff = new Date(Date.now() - FRESH_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id, created_at, status, payment_status, payment_method, customer_name, customer_phone, customer_address, delivery_type, admin_notes, total, wholesale_cost_total, wholesale_items, promo_code, promo_discount'
      )
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(300);
    if (err) {
      setError(plainError(err));
      setOrders([]);
    } else {
      setOrders((data || []) as Order[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function advance(o: Order) {
    const next = nextStatus(o);
    if (!next) return;
    setBusyId(o.id);
    const { error: err } = await supabase.from('orders').update({ status: next }).eq('id', o.id);
    setBusyId(null);
    if (err) { alert(`Could not advance: ${plainError(err)}`); return; }
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
    notifyOrderStatusChange({
      orderId: o.id,
      newStatus: next,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
    });
  }

  const groups: Group[] = useMemo(() => {
    const visible = orders.filter((o) => {
      const live = o.status || o.payment_status || '';
      if (hideDelivered && TERMINAL.has(live)) return false;
      return true;
    });
    const map = new Map<string, Group>();
    for (const o of visible) {
      const g = groupKeyFor(o);
      const existing = map.get(g.key);
      if (existing) existing.orders.push(o);
      else map.set(g.key, { key: g.key, label: g.label, emoji: g.emoji, orders: [o] });
    }
    // Sort: Nassau delivery → pickup → mailboat groups (alpha by island).
    return Array.from(map.values()).sort((a, b) => {
      const order = (k: string) =>
        k === 'nassau' ? 0 : k === 'pickup' ? 1 : 2;
      return order(a.key) - order(b.key) || a.label.localeCompare(b.label);
    });
  }, [orders, hideDelivered]);

  const counts = useMemo(() => {
    const c = { open: 0, today: 0, mailboat: 0 };
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    for (const o of orders) {
      const live = o.status || o.payment_status || '';
      if (!TERMINAL.has(live)) c.open += 1;
      if (new Date(o.created_at) >= startToday) c.today += 1;
      if ((o.delivery_type || '').toLowerCase() === 'mailboat') c.mailboat += 1;
    }
    return c;
  }, [orders]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>
          Pickup queue
        </h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setHideDelivered((v) => !v)}
            style={{
              background: hideDelivered ? '#0d1f3c' : '#f5c518',
              color: hideDelivered ? '#cbd5e1' : '#060d1f',
              border: hideDelivered ? '1px solid #1e3a5f' : 'none',
              borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {hideDelivered ? 'Show delivered' : 'Hide delivered'}
          </button>
          <button
            onClick={() => window.print()}
            style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            🖨 Print
          </button>
          <button
            onClick={load}
            style={{ background: '#0d1f3c', color: '#cbd5e1', border: '1px solid #1e3a5f', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 10, marginBottom: 14 }}>
        <Stat label="Open"       value={counts.open}     accent="#f5c518" />
        <Stat label="Today"      value={counts.today}    accent="#22c55e" />
        <Stat label="Mailboat"   value={counts.mailboat} accent="#a78bfa" />
      </div>

      {error && <ErrorBox text={error} />}

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && groups.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 16, textAlign: 'center' }}>
          {orders.length === 0
            ? 'No orders in the last 48 hours.'
            : 'Everything in the window is delivered or cancelled.'}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>
            {g.label} <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {g.orders.length} order{g.orders.length === 1 ? '' : 's'}</span>
          </div>
          {g.orders.map((o) => {
            const items = parseItems(o.wholesale_items);
            const total = Number(o.total ?? o.wholesale_cost_total ?? 0);
            const live = o.status || o.payment_status || 'Pending';
            const next = nextStatus(o);
            const tone =
              live === 'Delivered'        ? '#22c55e' :
              live === 'Cancelled'        ? '#f87171' :
              live === 'Out for Delivery' ? '#fb923c' :
              live === 'Packing'          ? '#a78bfa' :
              live === 'Ready for Pickup' ? '#0891b2' :
              live === 'Confirmed'        ? '#1a6fb5' :
              '#f5c518';
            return (
              <div key={o.id} className="slip" style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                      {o.customer_name || 'Guest'} · #{o.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {o.customer_phone || '—'}
                      {o.customer_address && ` · ${o.customer_address}`}
                    </div>
                    {o.admin_notes && (
                      <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' }}>
                        {o.admin_notes}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800, padding: '4px 8px', borderRadius: 999, color: '#060d1f', background: tone }}>
                    {live}
                  </span>
                </div>

                <ul style={{ margin: '10px 0 6px', padding: 0, listStyle: 'none', borderTop: '1px dashed #1e3a5f', paddingTop: 8 }}>
                  {items.length === 0 && (
                    <li style={{ color: '#94a3b8', fontSize: 12 }}>(no item detail on this order)</li>
                  )}
                  {items.map((it, i) => {
                    const qty = Number(it.qty ?? it.quantity ?? 1);
                    return (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span style={{ color: '#fff' }}>
                          <span style={{ display: 'inline-block', minWidth: 24, fontWeight: 800, color: '#f5c518' }}>{qty}×</span>
                          {it.name || '(unnamed)'}
                          {it.unit && <span style={{ color: '#94a3b8' }}> /{it.unit}</span>}
                        </span>
                        {typeof it.price === 'number' && (
                          <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>
                            ${(qty * it.price).toFixed(2)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {new Date(o.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    Total <span style={{ color: '#fff', fontWeight: 800 }}>BSD ${total.toFixed(2)}</span>
                    {o.payment_method && ` · ${o.payment_method.toUpperCase()}`}
                    {o.promo_code && (
                      <span style={{ marginLeft: 6, color: '#22c55e' }}>
                        −{o.promo_code}
                      </span>
                    )}
                  </div>
                  <div className="no-print" style={{ display: 'flex', gap: 6 }}>
                    <Link
                      href={`/pick-ticket/${o.id}`}
                      style={miniBtn('#cbd5e1')}
                    >
                      Pick ticket
                    </Link>
                    {next && (
                      <button
                        onClick={() => advance(o)}
                        disabled={busyId === o.id}
                        style={miniBtn('#f5c518')}
                      >
                        {busyId === o.id ? '…' : `→ ${next}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: #fff !important; color: #000 !important; }
          .slip { page-break-inside: avoid; background: #fff !important; color: #000 !important; border: 1px solid #ccc !important; }
          .slip * { color: #000 !important; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
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
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
