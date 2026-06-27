'use client';

// app/founder/phone-orders/page.tsx
//
// Founder approval gate for phone orders. PENDING orders show here first with
// the payment type visible; the founder approves (→ cascade: invoice + supplier
// POs + stock decrement) or cancels. APPROVED orders show their print links
// (invoice + per-supplier pick ticket). Grouped by day.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Line = { name?: string; qty?: number; unit?: string; unit_price?: number; line_total?: number };
type Order = {
  id: string; created_at: string; customer_name: string | null; customer_phone: string | null;
  payment_type: string | null; wholesale_items: Line[] | null; subtotal: number | null; total: number | null;
  status: string; payment_ref: string | null; admin_notes: string | null;
};

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() {
  if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return _sb;
}
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const PAY_LABEL: Record<string, string> = { cod: '💵 Cash on delivery', transfer: '🏦 Bank transfer (later)', credit: '🧾 Credit account (later)' };

export default function FounderPhoneOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch('/api/phone-orders/list?status=all', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) { setError(j.error || `Failed (HTTP ${res.status})`); setOrders([]); }
    else setOrders(j.orders as Order[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'cancel') {
    if (action === 'cancel' && !confirm('Cancel this phone order? It will be discarded.')) return;
    setBusyId(id);
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch(`/api/phone-orders/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ action }),
    });
    const j = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok || !j.ok) { alert(j.error || `Failed (HTTP ${res.status})`); return; }
    if (action === 'approve' && j.steps) {
      const warn = Object.entries(j.steps as Record<string, string>).filter(([, v]) => /fail|error|http/i.test(v));
      if (warn.length) alert(`Approved, but check: ${warn.map(([k, v]) => `${k} ${v}`).join('; ')}`);
    }
    load();
  }

  const pending = useMemo(() => orders.filter((o) => o.status === 'pending_approval'), [orders]);
  const approved = useMemo(() => orders.filter((o) => o.status === 'approved'), [orders]);

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📞 Phone Orders — Approval</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Approve to release: invoice + supplier POs + stock. Pending = on hold, no impact.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/phone-order" style={pill}>+ New phone order</Link>
            <button onClick={load} style={{ ...pill, cursor: 'pointer' }}>↻</button>
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading…</div> : (
          <>
            <Section title={`⏳ Pending approval (${pending.length})`} accent={GOLD} />
            {pending.length === 0 && <Empty text="No phone orders waiting." />}
            {groupByDay(pending).map(([day, list]) => (
              <DayGroup key={'p' + day} day={day}>
                {list.map((o) => (
                  <Card key={o.id} o={o}>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => act(o.id, 'approve')} disabled={busyId === o.id} style={{ ...btn('#22c55e'), flex: 1 }}>{busyId === o.id ? '…' : '✓ Approve'}</button>
                      <button onClick={() => act(o.id, 'cancel')} disabled={busyId === o.id} style={btn('#f87171')}>Cancel</button>
                    </div>
                  </Card>
                ))}
              </DayGroup>
            ))}

            <div style={{ height: 18 }} />
            <Section title={`✓ Approved (${approved.length})`} accent="#22c55e" />
            {approved.length === 0 && <Empty text="No approved phone orders yet." />}
            {groupByDay(approved).map(([day, list]) => (
              <DayGroup key={'a' + day} day={day}>
                {list.map((o) => (
                  <Card key={o.id} o={o}>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <a href={o.payment_ref ? `/invoice?id=${o.payment_ref}` : '#'} target="_blank" rel="noreferrer" style={{ ...btn('#60a5fa'), flex: 1, textAlign: 'center', textDecoration: 'none', opacity: o.payment_ref ? 1 : 0.4, pointerEvents: o.payment_ref ? 'auto' : 'none' }}>🧾 Invoice</a>
                      <a href={`/pick-ticket/order/${o.id}`} target="_blank" rel="noreferrer" style={{ ...btn('#a78bfa'), flex: 1, textAlign: 'center', textDecoration: 'none' }}>📦 Pick ticket</a>
                    </div>
                  </Card>
                ))}
              </DayGroup>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function groupByDay(list: Order[]): [string, Order[]][] {
  const m = new Map<string, Order[]>();
  for (const o of list) {
    const day = new Date(o.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    (m.get(day) ?? m.set(day, []).get(day)!).push(o);
  }
  return Array.from(m.entries());
}

function Section({ title, accent }: { title: string; accent: string }) {
  return <div style={{ fontSize: 13, fontWeight: 900, color: accent, textTransform: 'uppercase', letterSpacing: 1, margin: '6px 0 8px' }}>{title}</div>;
}
function Empty({ text }: { text: string }) { return <div style={{ color: '#64748b', fontSize: 13, padding: '8px 2px' }}>{text}</div>; }
function DayGroup({ day, children }: { day: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, margin: '6px 0 4px' }}>{day}</div>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
  );
}
function Card({ o, children }: { o: Order; children: React.ReactNode }) {
  const lines = Array.isArray(o.wholesale_items) ? o.wholesale_items : [];
  return (
    <div style={{ background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{o.customer_name || 'Customer'}{o.customer_phone ? <span style={{ color: '#64748b', fontWeight: 400, fontSize: 12 }}> · {o.customer_phone}</span> : null}</div>
        <div style={{ color: GOLD, fontWeight: 900 }}>BSD ${Number(o.total ?? 0).toFixed(2)}</div>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>#{o.id.slice(0, 8).toUpperCase()} · {o.payment_type ? (PAY_LABEL[o.payment_type] ?? o.payment_type) : '—'}</div>
      <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6, lineHeight: 1.5 }}>
        {lines.map((l, i) => <div key={i}>{Number(l.qty ?? 0)} × {l.name} <span style={{ color: '#64748b' }}>@ ${Number(l.unit_price ?? 0).toFixed(2)}</span></div>)}
      </div>
      {children}
    </div>
  );
}

const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', background: 'transparent' };
function btn(color: string): React.CSSProperties { return { background: 'transparent', border: `1px solid ${color}`, color, borderRadius: 8, padding: '8px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }; }
