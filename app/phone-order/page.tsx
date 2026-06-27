'use client';

// app/phone-order/page.tsx
//
// Staff "Order by Phone" entry. Pick products, set qty + unit price, choose the
// payment type, submit. The order lands PENDING in the founder approval queue —
// no inventory/supplier/payment impact until the founder approves it.
//
// Auth + role are enforced server-side by /api/phone-orders/create; this page
// just requires a signed-in staffer.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Catalog = { id: string; name: string; sku: string | null; unit: string; category: string; price: number };
type Line = { product_id: string; name: string; sku: string | null; unit: string; qty: number; unit_price: number };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() {
  if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return _sb;
}

const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

export default function PhoneOrderPage() {
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentType, setPaymentType] = useState<'cod' | 'transfer' | 'credit'>('cod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await sb()
        .from('products')
        .select('id, name, sku, unit_of_measure, category, product_pricing!inner(manual_unit_price)')
        .eq('sell_online', true)
        .eq('status', 'active')
        .eq('product_pricing.channel', 'online_market')
        .eq('product_pricing.is_current', true)
        .eq('product_pricing.is_active', true)
        .order('name');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []).map((p: any) => {
        const pr = Array.isArray(p.product_pricing) ? p.product_pricing[0] : p.product_pricing;
        return { id: p.id, name: p.name, sku: p.sku, unit: p.unit_of_measure ?? 'each', category: p.category ?? 'other', price: Number(pr?.manual_unit_price ?? 0) };
      });
      setCatalog(rows);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);
    return catalog.filter((c) => c.name.toLowerCase().includes(q) || (c.sku ?? '').toLowerCase().includes(q)).slice(0, 40);
  }, [search, catalog]);

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  function addLine(c: Catalog) {
    setLines((prev) => {
      const ex = prev.find((l) => l.product_id === c.id);
      if (ex) return prev.map((l) => l.product_id === c.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { product_id: c.id, name: c.name, sku: c.sku, unit: c.unit, qty: 1, unit_price: c.price }];
    });
  }
  function setLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => l.product_id === id ? { ...l, ...patch } : l));
  }
  function removeLine(id: string) { setLines((prev) => prev.filter((l) => l.product_id !== id)); }

  async function submit() {
    setError(null);
    if (!customerName.trim()) { setError('Enter the customer name.'); return; }
    if (lines.length === 0) { setError('Add at least one product.'); return; }
    setBusy(true);
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch('/api/phone-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        payment_type: paymentType,
        items: lines.map((l) => ({ product_id: l.product_id, name: l.name, sku: l.sku, qty: l.qty, unit: l.unit, unit_price: l.unit_price })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !j.ok) { setError(j.error || `Failed (HTTP ${res.status})`); return; }
    setDone({ orderId: j.order_id, total: j.total });
    setLines([]); setCustomerName(''); setCustomerPhone(''); setPaymentType('cod'); setSearch('');
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 96 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📞 Order by Phone</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Lands in the founder approval queue — no impact until approved.</div>
          </div>
          <Link href="/dashboard" style={{ color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px' }}>← Dashboard</Link>
        </div>

        {done && (
          <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 14 }}>✓ Phone order sent for approval — #{done.orderId.slice(0, 8).toUpperCase()} · BSD ${done.total.toFixed(2)}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>The founder will see it in the pending queue. Enter another below.</div>
          </div>
        )}

        {/* Customer + payment */}
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name *" style={input} />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Customer phone (optional)" style={input} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {([['cod', '💵 Cash on delivery'], ['transfer', '🏦 Bank transfer (pay later)'], ['credit', '🧾 Credit account (pay later)']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setPaymentType(v)} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: paymentType === v ? `2px solid ${GOLD}` : `1px solid ${BORDER}`, background: paymentType === v ? 'rgba(245,197,24,0.12)' : 'transparent', color: paymentType === v ? GOLD : '#cbd5e1', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Product picker */}
        <div style={card}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={loading ? 'Loading catalog…' : 'Search product by name or SKU…'} style={input} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, marginTop: 8, maxHeight: 230, overflowY: 'auto' }}>
            {filtered.map((c) => (
              <button key={c.id} onClick={() => addLine(c)} style={{ textAlign: 'left', background: '#0d1f3c', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: GOLD, marginTop: 2 }}>${c.price.toFixed(2)}<span style={{ color: '#64748b' }}>/{c.unit}</span></div>
              </button>
            ))}
          </div>
        </div>

        {/* Lines */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 8 }}>Order lines ({lines.length})</div>
          {lines.length === 0 ? <div style={{ color: '#64748b', fontSize: 13, padding: 8 }}>Tap products above to add them.</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {lines.map((l) => (
                <div key={l.product_id} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 72px 64px 28px', gap: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                  <input type="number" step="0.01" min="0" value={l.qty} onChange={(e) => setLine(l.product_id, { qty: Number(e.target.value) })} style={{ ...input, marginBottom: 0, padding: '6px 8px', fontSize: 13 }} title="Qty" />
                  <input type="number" step="0.01" min="0" value={l.unit_price} onChange={(e) => setLine(l.product_id, { unit_price: Number(e.target.value) })} style={{ ...input, marginBottom: 0, padding: '6px 8px', fontSize: 13 }} title="Unit price" />
                  <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, textAlign: 'right' }}>${(l.qty * l.unit_price).toFixed(2)}</div>
                  <button onClick={() => removeLine(l.product_id)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${BORDER}`, marginTop: 10, paddingTop: 10, fontWeight: 900, fontSize: 18 }}>
            <span>Total</span><span style={{ color: GOLD }}>BSD ${total.toFixed(2)}</span>
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        <button onClick={submit} disabled={busy || lines.length === 0} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: busy || lines.length === 0 ? '#475569' : GOLD, color: INK, fontWeight: 900, fontSize: 15, cursor: busy || lines.length === 0 ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Sending…' : '📤 Send for founder approval'}
        </button>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, marginBottom: 12 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, marginBottom: 0, boxSizing: 'border-box', outline: 'none' };
