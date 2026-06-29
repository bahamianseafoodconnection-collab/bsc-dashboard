'use client';

// app/spinytails/orders/page.tsx  (G19)
//
// Cross-channel Spiny Tail order queue — every active order (phone / online /
// Nassau POS) with an in-house-processed line the plant must assemble. Pull
// from freezer, process, pack. Grouped by channel.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Item = { name: string; qty: number; unit: string | null };
type Order = { id: string; channel: string; customer_name: string | null; status: string | null; payment_status: string | null; created_at: string; total: number | null; payment_ref: string | null; items: Item[] };

const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const CHAN_ICON: Record<string, string> = { Phone: '📞', Online: '🛒', 'Nassau POS': '🧾', 'Andros POS': '🏝️' };

export default function SpinyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Sign in required'); setLoading(false); return; }
    const res = await fetch('/api/spinytails/orders', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({ ok: false }));
    if (!res.ok || !j.ok) setError(j.error || `Failed (HTTP ${res.status})`); else setOrders(j.orders as Order[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byChannel = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of orders) (m.get(o.channel) ?? m.set(o.channel, []).get(o.channel)!).push(o);
    return [...m.entries()];
  }, [orders]);

  const paid = (o: Order) => ['paid', 'paid_in_full', 'on_account'].includes((o.payment_status ?? '').toLowerCase());

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>🍤 Spiny Tail Orders</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Phone · online · Nassau POS — pull from freezer, process, pack.</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/spinytails" style={pill}>← Spiny Tail</Link>
            <button onClick={load} style={{ ...pill, cursor: 'pointer' }}>↻</button>
          </div>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading…</div> : orders.length === 0 ? (
          <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>No orders to process. 🎉</div>
        ) : byChannel.map(([chan, list]) => (
          <div key={chan} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: GOLD, margin: '6px 0 8px' }}>{CHAN_ICON[chan] ?? '📦'} {chan} <span style={{ color: '#64748b', fontWeight: 600 }}>({list.length})</span></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {list.map((o) => (
                <div key={o.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{o.customer_name || 'Customer'}
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: paid(o) ? '#4ade80' : '#fbbf24' }}>{paid(o) ? 'PAID' : (o.payment_status || o.status || '—')}</span></div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>#{o.id.slice(0, 8).toUpperCase()} · {new Date(o.created_at).toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6 }}>
                        {o.items.map((it, i) => <span key={i} style={{ display: 'inline-block', marginRight: 10 }}>🦞 <strong>{it.qty}{it.unit ? ` ${it.unit}` : ''}</strong> {it.name}</span>)}
                      </div>
                    </div>
                    {o.payment_ref && <a href={`/invoice?id=${o.payment_ref}`} target="_blank" rel="noreferrer" style={{ ...pill, background: GOLD, color: INK, fontWeight: 800, flexShrink: 0 }}>🖨 Pick</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
