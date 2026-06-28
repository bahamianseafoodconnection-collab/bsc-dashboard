'use client';

// app/founder/payment-approvals/page.tsx
//
// Manual payment gate — orders held in 'Payment Pending' (the safe default).
// Founder/co_founder approve (→ unlocks fulfillment) or decline. Every decision
// is audited. This is the fallback path until RBC/Plug'n Pay webhook validation
// is wired (blocked on Julian).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Row = { id: string; ref: string; created_at: string; customer: string | null; phone: string | null; total: number; payment_method: string | null; order_type: string | null; reason: string };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function PaymentApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const j = await api('/api/founder/payment-approvals');
    if (!j.ok) { setError(j.error || 'Founder only'); setRows([]); } else setRows(j.orders as Row[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'decline') {
    if (action === 'decline' && !confirm('Decline this payment? The order stays held.')) return;
    if (action === 'approve' && !confirm('Approve payment manually? This unlocks the order for fulfillment.')) return;
    setBusy(id);
    const j = await api('/api/founder/payment-approvals', { method: 'POST', body: JSON.stringify({ order_id: id, action }) });
    setBusy(null);
    if (!j.ok) { alert(j.error || 'Failed'); return; }
    load();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>🔐 Payment Approvals</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Orders held until payment is confirmed. Approve only what you can verify settled.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={load} style={pill}>↻</button><Link href="/dashboard" style={pill}>← Dashboard</Link></div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading…</div> : rows.length === 0 ? (
          <div style={{ color: '#4ade80', padding: 16, background: 'rgba(34,197,94,0.08)', border: '1px solid #166534', borderRadius: 10 }}>✓ No orders awaiting payment approval.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((o) => (
              <div key={o.id} style={{ background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{o.customer || 'Customer'}{o.phone ? <span style={{ color: '#64748b', fontWeight: 400, fontSize: 12 }}> · {o.phone}</span> : null}</div>
                  <div style={{ color: GOLD, fontWeight: 900 }}>BSD ${o.total.toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>#{o.ref} · {o.payment_method ?? '—'} · {new Date(o.created_at).toLocaleString()} · <span style={{ color: '#fbbf24' }}>{o.reason}</span></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => act(o.id, 'approve')} disabled={busy === o.id} style={{ ...btn('#22c55e'), flex: 1 }}>{busy === o.id ? '…' : '✓ Approve payment'}</button>
                  <button onClick={() => act(o.id, 'decline')} disabled={busy === o.id} style={btn('#f87171')}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', background: 'transparent' };
function btn(color: string): React.CSSProperties { return { background: 'transparent', border: `1px solid ${color}`, color, borderRadius: 8, padding: '9px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }; }
