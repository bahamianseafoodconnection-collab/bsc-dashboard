'use client';

// app/cashier/add-customer/page.tsx  (G11)
//
// Standalone Add Customer for cashiers (previously only possible mid-sale at
// POS). Name/phone/email — server-side dedupe by phone (E.164) then email via
// /api/pos/save-customer, so re-adding an existing customer UPDATES rather
// than duplicates. A live name search surfaces existing matches first.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Match = { id: string; full_name: string | null; phone: string | null; email: string | null; total_orders: number | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function AddCustomerPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; action: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setMatches([]); return; }
    const j = await api(`/api/pos/customer-search?q=${encodeURIComponent(q.trim())}`);
    if (j.ok) setMatches(j.matches as Match[]);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(name), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [name, search]);

  async function submit() {
    setError(null); setDone(null);
    if (!name.trim() && !phone.trim()) { setError('Enter at least a name or phone.'); return; }
    setBusy(true);
    const j = await api('/api/pos/save-customer', { method: 'POST', body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim(), email_consent: consent, origin_channel: 'nassau_pos' }) });
    setBusy(false);
    if (!j.ok) { setError(j.error || 'Save failed'); return; }
    setDone({ name: j.full_name || name.trim() || 'Customer', action: j.action || (j.was_new ? 'created' : 'updated') });
    setName(''); setPhone(''); setEmail(''); setMatches([]);
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>👤 Add Customer</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>New or returning — matched by phone so no duplicates.</div></div>
          <Link href="/cashier" style={pill}>← Cashier</Link>
        </div>

        {done && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, marginBottom: 12, color: '#4ade80', fontWeight: 700, fontSize: 14 }}>
            ✓ {done.action === 'updated' ? 'Matched + updated' : 'Added'} {done.name}.
          </div>
        )}
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        <div style={card}>
          <div style={lbl}>Full name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Patricia Rolle" style={input} />
          {matches.length > 0 && (
            <div style={{ background: '#111c33', border: `1px solid ${BORDER}`, borderRadius: 8, marginTop: 6, padding: 6 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, padding: '2px 4px 4px' }}>Existing matches — pick to avoid a duplicate</div>
              {matches.map((m) => (
                <button key={m.id} onClick={() => { setName(m.full_name ?? ''); setPhone(m.phone ?? ''); setEmail(m.email ?? ''); setMatches([]); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#cbd5e1', padding: '6px 4px', cursor: 'pointer', fontSize: 13, borderTop: `1px solid ${BORDER}` }}>
                  {m.full_name || 'Customer'} <span style={{ color: '#64748b' }}>· {m.phone || 'no phone'} · {m.total_orders ?? 0} orders</span>
                </button>
              ))}
            </div>
          )}
          <div style={lbl}>Phone</div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="242-xxx-xxxx" inputMode="tel" style={input} />
          <div style={lbl}>Email (optional)</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" inputMode="email" style={input} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#94a3b8', margin: '4px 0 10px' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Opt in to BSC promotions / catch reports
          </label>
          <button onClick={submit} disabled={busy} style={{ ...pill, width: '100%', background: GOLD, color: INK, fontWeight: 900, padding: 12, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Saving…' : '👤 Save customer'}</button>
        </div>
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' };
const input: React.CSSProperties = { width: '100%', padding: '10px 11px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 15, marginBottom: 4, boxSizing: 'border-box', outline: 'none' };
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, margin: '8px 0 3px' };
