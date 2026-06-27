'use client';

// app/cashier/phone-orders/page.tsx
//
// Cashier view of APPROVED phone orders — pull one up, print the customer
// INVOICE (letter-size /invoice page → AirPrint to the HP), file for payment.
// Grouped by day so the cashier sees the day's work at a glance.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Line = { name?: string; qty?: number; unit_price?: number };
type Order = { id: string; created_at: string; customer_name: string | null; customer_phone: string | null; payment_type: string | null; wholesale_items: Line[] | null; total: number | null; payment_ref: string | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const PAY: Record<string, string> = { cod: '💵 COD', transfer: '🏦 Transfer', credit: '🧾 Credit' };

export default function CashierPhoneOrdersPage() {
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
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 20 }}>📞 Phone Orders — Invoices</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Approved orders. Print the invoice, file for payment.</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/cashier" style={pill}>← Cashier</Link>
            <button onClick={load} style={{ ...pill, cursor: 'pointer' }}>↻</button>
          </div>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading…</div> : orders.length === 0 ? <div style={{ color: '#64748b', padding: 12 }}>No approved phone orders.</div> : (
          Array.from(byDay.entries()).map(([day, list]) => (
            <div key={day} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, margin: '6px 0 6px' }}>{day}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {list.map((o) => (
                  <div key={o.id} style={{ background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{o.customer_name || 'Customer'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>#{o.id.slice(0, 8).toUpperCase()} · {o.payment_type ? (PAY[o.payment_type] ?? o.payment_type) : '—'} · {(o.wholesale_items?.length ?? 0)} items · <span style={{ color: GOLD }}>${Number(o.total ?? 0).toFixed(2)}</span></div>
                    </div>
                    <a href={o.payment_ref ? `/invoice?id=${o.payment_ref}` : '#'} target="_blank" rel="noreferrer" style={{ ...printBtn, opacity: o.payment_ref ? 1 : 0.4, pointerEvents: o.payment_ref ? 'auto' : 'none' }}>🖨 Invoice</a>
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
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px' };
const printBtn: React.CSSProperties = { background: GOLD, color: INK, fontWeight: 900, fontSize: 13, borderRadius: 8, padding: '10px 14px', textDecoration: 'none', whiteSpace: 'nowrap' };
