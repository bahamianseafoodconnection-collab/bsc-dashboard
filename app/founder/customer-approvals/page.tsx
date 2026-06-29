'use client';

// app/founder/customer-approvals/page.tsx  (G7)
//
// Founder review of inbound customer signups / WhatsApp intakes.
// Approve → convert to a customer (deduped); Dismiss → mark handled.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Signup = {
  id: string; channel: string | null; email: string | null; phone: string | null;
  intent_meta: Record<string, unknown> | null; created_at: string; existing_customer: boolean;
};

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function CustomerApprovalsPage() {
  const [rows, setRows] = useState<Signup[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const j = await api('/api/founder/customer-approvals');
    if (!j.ok) { setError(j.error || 'Founder only'); return; }
    setRows(j.signups as Signup[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'dismiss') {
    setBusy(`${id}:${action}`);
    const j = await api('/api/founder/customer-approvals', { method: 'POST', body: JSON.stringify({ action, id, name: names[id] || undefined }) });
    setBusy(null);
    if (!j.ok) { setError(j.error || 'Action failed'); return; }
    load();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>👥 Customer Intakes</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Signups / WhatsApp intakes — approve into the system or dismiss.</div></div>
          <Link href="/founder" style={pill}>← Founder</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        {rows.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No pending intakes. 🎉</div>}

        {rows.map((s) => (
          <div key={s.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{s.email || s.phone || 'Anonymous'}
                  {s.existing_customer && <span style={{ marginLeft: 8, fontSize: 10, background: '#1e3a5f', color: '#93c5fd', padding: '1px 6px', borderRadius: 4 }}>already a customer</span>}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {s.channel || 'web'} · {s.phone || 'no phone'} · {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={names[s.id] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))} placeholder="Name (optional)" style={input} />
              <div style={{ flex: 1 }} />
              <button onClick={() => act(s.id, 'approve')} disabled={!!busy} style={{ ...pill, cursor: 'pointer', background: GOLD, color: INK, fontWeight: 800 }}>{busy === `${s.id}:approve` ? '…' : '✓ Approve → customer'}</button>
              <button onClick={() => act(s.id, 'dismiss')} disabled={!!busy} style={{ ...pill, cursor: 'pointer', color: '#94a3b8' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' };
const input: React.CSSProperties = { padding: '8px 11px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 13, outline: 'none', width: 180, maxWidth: '40vw' };
