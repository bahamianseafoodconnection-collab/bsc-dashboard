'use client';

// app/cashier/whatsapp/page.tsx  (G8)
//
// Cashier WhatsApp monitor. Customers WhatsApp BSC (scan the QR) → messages
// land here live. Cashier adds the customer (phone-deduped) and starts a
// phone order from the message. Polls for near-real-time.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Msg = { id: string; from_number: string | null; from_name: string | null; body: string | null; num_media: number; verified: boolean; received_at: string; handled_at: string | null; linked_customer_id: string | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const WA_NUMBER = '12423613474';
const QR = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=${encodeURIComponent(`https://wa.me/${WA_NUMBER}`)}`;

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function CashierWhatsAppPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await api(`/api/cashier/whatsapp?show=${show}`);
    if (!j.ok) { setError(j.error || 'Cashier only'); return; }
    setError(null); setMsgs(j.messages as Msg[]);
  }, [show]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  async function addCustomer(m: Msg) {
    setBusy(m.id);
    const r = await api('/api/pos/save-customer', { method: 'POST', body: JSON.stringify({ name: m.from_name || '', phone: m.from_number || '', origin_channel: 'whatsapp' }) });
    if (r.ok && r.customer_id) await api('/api/cashier/whatsapp', { method: 'POST', body: JSON.stringify({ action: 'handle', id: m.id, customer_id: r.customer_id }) });
    setBusy(null);
    if (!r.ok) { setError(r.error || 'Add customer failed'); return; }
    load();
  }
  async function handle(id: string, action: 'handle' | 'unhandle') {
    setBusy(id);
    await api('/api/cashier/whatsapp', { method: 'POST', body: JSON.stringify({ action, id }) });
    setBusy(null); load();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>💬 WhatsApp</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Customer messages → add customer → start a phone order.</div></div>
          <Link href="/cashier" style={pill}>← Cashier</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={QR} alt="WhatsApp BSC" style={{ width: 90, height: 90, borderRadius: 8, background: '#fff' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Scan to chat with BSC on WhatsApp</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Or share <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>wa.me/{WA_NUMBER}</a> · 242-361-3474</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
          {(['open', 'all'] as const).map((s) => <button key={s} onClick={() => setShow(s)} style={{ ...pill, cursor: 'pointer', background: show === s ? GOLD : 'transparent', color: show === s ? INK : '#cbd5e1', fontWeight: show === s ? 800 : 500, textTransform: 'capitalize' }}>{s}</button>)}
          <div style={{ flex: 1 }} />
          <button onClick={load} style={{ ...pill, cursor: 'pointer' }}>↻</button>
        </div>

        {msgs.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No {show === 'open' ? 'open' : ''} messages.</div>}

        {msgs.map((m) => (
          <div key={m.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{m.from_name || m.from_number || 'Unknown'}
                  {!m.verified && <span style={{ marginLeft: 8, fontSize: 9, background: '#7f1d1d', color: '#fecaca', padding: '1px 5px', borderRadius: 4 }}>unverified</span>}
                  {m.linked_customer_id && <span style={{ marginLeft: 8, fontSize: 9, background: '#14532d', color: '#86efac', padding: '1px 5px', borderRadius: 4 }}>customer</span>}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.from_number} · {new Date(m.received_at).toLocaleString()}{m.num_media > 0 ? ` · 📎 ${m.num_media}` : ''}</div>
              </div>
            </div>
            {m.body && <div style={{ fontSize: 14, color: '#e2e8f0', marginTop: 8, whiteSpace: 'pre-wrap', background: '#111c33', borderRadius: 8, padding: '8px 10px' }}>{m.body}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {!m.linked_customer_id && <button onClick={() => addCustomer(m)} disabled={busy === m.id} style={{ ...pill, cursor: 'pointer', background: GOLD, color: INK, fontWeight: 800 }}>{busy === m.id ? '…' : '👤 Add customer'}</button>}
              <a href="/phone-order" target="_blank" rel="noreferrer" style={{ ...pill, color: '#93c5fd' }}>📞 New phone order</a>
              <div style={{ flex: 1 }} />
              {m.handled_at
                ? <button onClick={() => handle(m.id, 'unhandle')} disabled={busy === m.id} style={{ ...pill, cursor: 'pointer', color: '#94a3b8' }}>Reopen</button>
                : <button onClick={() => handle(m.id, 'handle')} disabled={busy === m.id} style={{ ...pill, cursor: 'pointer' }}>✓ Done</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' };
