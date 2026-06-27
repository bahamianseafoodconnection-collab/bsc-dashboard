'use client';

// app/spinytails/phone-orders/page.tsx
//
// Spiny Tail processing-room view of APPROVED phone orders — pull one up, print
// the per-supplier PICK TICKET (/pick-ticket/order → AirPrint to the HP),
// assemble + pack. Grouped by day = the day's work board.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Line = { name?: string; qty?: number };
type Order = { id: string; created_at: string; customer_name: string | null; payment_type: string | null; wholesale_items: Line[] | null; total: number | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const PURPLE = '#7c3aed', INK = '#1a0a2e', BORDER = 'rgba(167,139,250,0.3)';

export default function SpinyPhoneOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch('/api/phone-orders/list?status=approved', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) setError(j.error || `Failed (HTTP ${res.status})`); else setOrders(j.orders as Order[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byDay = new Map<string, Order[]>();
  for (const o of orders) {
    const d = new Date(o.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(o);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0ff', color: '#1a0a2e', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: '#4c1d95', fontWeight: 900, fontSize: 20 }}>📞 Phone Orders — Pick Tickets</div>
            <div style={{ color: '#7c3aed', fontSize: 12 }}>Approved orders to assemble. Print the pick ticket, pack, mark shipped.</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/spinytails" style={pill}>← Spiny Tail</Link>
            <button onClick={load} style={{ ...pill, cursor: 'pointer' }}>↻</button>
          </div>
        </div>
        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>Loading…</div> : orders.length === 0 ? <div style={{ color: '#94a3b8', padding: 12 }}>No approved phone orders.</div> : (
          Array.from(byDay.entries()).map(([day, list]) => (
            <div key={day} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 800, margin: '6px 0 6px' }}>{day}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {list.map((o) => (
                  <div key={o.id} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#4c1d95' }}>{o.customer_name || 'Customer'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>#{o.id.slice(0, 8).toUpperCase()} · {(o.wholesale_items?.length ?? 0)} items to pull</div>
                    </div>
                    <a href={`/pick-ticket/order/${o.id}`} target="_blank" rel="noreferrer" style={printBtn}>🖨 Pick ticket</a>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
const pill: React.CSSProperties = { color: '#7c3aed', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', background: '#fff' };
const printBtn: React.CSSProperties = { background: PURPLE, color: '#fff', fontWeight: 900, fontSize: 13, borderRadius: 8, padding: '10px 14px', textDecoration: 'none', whiteSpace: 'nowrap' };
