'use client';

// app/founder/paid-orders/page.tsx
//
// Pillar 2 — RBC-approved online paid orders, grouped by supplier, ready to
// route. Only payment_status='paid' appears in the supplier groups. Pending /
// declined orders are listed separately under "Not paid — do NOT send" so they
// never get routed. CSV export of the supplier-grouped lines.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Line = { order_ref: string; customer: string; destination: string; product_name: string; qty: number; unit_price: number; revenue: number; cogs: number };
type Supplier = { supplier_name: string; lines: Line[]; revenue: number; cogs: number; profit: number };
type NotPaid = { order_ref: string; customer: string | null; status: string | null; payment_method: string | null; total: number; created_at: string };
type Resp = { ok: boolean; range: { start: string; end: string }; suppliers: Supplier[]; paid_count: number; not_paid: NotPaid[]; totals: { paid_revenue: number; supplier_count: number }; error?: string };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function PaidOrdersPage() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true); setError(null);
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch(`/api/founder/paid-orders?date=${d}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = (await res.json().catch(() => ({}))) as Resp;
    if (!res.ok || !j.ok) { setError(j.error || `Failed (HTTP ${res.status})`); setData(null); }
    else setData(j);
    setLoading(false);
  }, []);
  useEffect(() => { load(date); }, [date, load]);

  function downloadCsv() {
    if (!data) return;
    const rows = [['Supplier', 'Order', 'Customer', 'Destination', 'Product', 'Qty', 'Unit Price', 'Revenue', 'COGS', 'Profit']];
    for (const s of data.suppliers) for (const l of s.lines) {
      rows.push([s.supplier_name, l.order_ref, l.customer, l.destination, l.product_name, String(l.qty), l.unit_price.toFixed(2), l.revenue.toFixed(2), l.cogs.toFixed(2), (l.revenue - l.cogs).toFixed(2)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bsc-paid-orders-by-supplier-${date}.csv`; a.click();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>🧾 Paid Orders → Suppliers</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>RBC-approved online orders only, grouped by supplier — ready to route.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: '#111c33', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
            <button onClick={downloadCsv} disabled={!data || data.suppliers.length === 0} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: data?.suppliers.length ? 1 : 0.4 }}>⬇ Excel/CSV</button>
            <Link href="/dashboard" style={pill}>← Dashboard</Link>
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading…</div> : data && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <Stat label="Paid orders" value={String(data.paid_count)} />
              <Stat label="Suppliers to route" value={String(data.totals.supplier_count)} />
              <Stat label="Paid revenue" value={`$${data.totals.paid_revenue.toFixed(2)}`} accent={GOLD} />
            </div>

            {data.suppliers.length === 0 && <div style={{ color: '#64748b', padding: 12 }}>No paid online orders for this day.</div>}
            {data.suppliers.map((s) => (
              <div key={s.supplier_name} style={{ background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: GOLD }}>{s.supplier_name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>rev <b style={{ color: '#fff' }}>${s.revenue.toFixed(2)}</b> · cost ${s.cogs.toFixed(2)} · profit <b style={{ color: '#4ade80' }}>${s.profit.toFixed(2)}</b></div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                    <th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Product</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                  </tr></thead>
                  <tbody>
                    {s.lines.map((l, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #16243f' }}>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{l.order_ref}</td>
                        <td style={td}>{l.customer}{l.destination ? <span style={{ color: '#64748b' }}> · {l.destination}</span> : null}</td>
                        <td style={td}>{l.product_name}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{l.qty}</td>
                        <td style={{ ...td, textAlign: 'right' }}>${l.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {data.not_paid.length > 0 && (
              <div style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid #7f1d1d', borderRadius: 10, padding: 12, marginTop: 14 }}>
                <div style={{ fontWeight: 800, color: '#f87171', fontSize: 13, marginBottom: 6 }}>⚠ Not paid — DO NOT send to suppliers ({data.not_paid.length})</div>
                {data.not_paid.map((o) => (
                  <div key={o.order_ref} style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span style={{ fontFamily: 'monospace' }}>{o.order_ref} · {o.customer || 'Customer'}</span>
                    <span style={{ color: '#fbbf24' }}>{(o.status || 'pending').toUpperCase()} · ${o.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', minWidth: 120 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: accent ?? '#fff', marginTop: 2 }}>{value}</div>
    </div>
  );
}
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
const th: React.CSSProperties = { padding: '4px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '5px 6px', color: '#e2e8f0' };
