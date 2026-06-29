'use client';

// app/founder/credit/page.tsx  (G6)
//
// Founder credit approval. Search a customer → approve them for a credit
// account with a limit + terms. Credit orders then bill to the account
// (→ credit_invoices → weekly/monthly statements).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Cust = {
  id: string; full_name: string | null; phone: string | null;
  is_credit_customer: boolean | null; credit_limit: number | null;
  credit_terms: string | null; current_balance: number | null; credit_approved_at: string | null;
};

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const TERMS = ['NET_7', 'NET_15', 'NET_30'];

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function FounderCreditPage() {
  const [rows, setRows] = useState<Cust[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { limit: string; terms: string }>>({});

  const load = useCallback(async (query: string) => {
    setError(null);
    const j = await api(`/api/founder/credit${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    if (!j.ok) { setError(j.error || 'Founder only'); return; }
    setRows(j.customers as Cust[]);
  }, []);
  useEffect(() => { load(''); }, [load]);

  function draftFor(c: Cust) {
    return edit[c.id] ?? { limit: String(c.credit_limit ?? ''), terms: c.credit_terms ?? 'NET_7' };
  }
  function setDraft(id: string, k: 'limit' | 'terms', v: string) {
    setEdit((e) => ({ ...e, [id]: { ...(e[id] ?? { limit: '', terms: 'NET_7' }), [k]: v } }));
  }

  async function save(c: Cust, enable: boolean) {
    const d = draftFor(c);
    setBusy(c.id); setError(null);
    const j = await api('/api/founder/credit', { method: 'POST', body: JSON.stringify({ customer_id: c.id, is_credit_customer: enable, credit_limit: enable ? Number(d.limit || 0) : 0, credit_terms: d.terms }) });
    setBusy(null);
    if (!j.ok) { setError(j.error || 'Save failed'); return; }
    load(q);
  }

  const money = (n: number | null) => `$${Number(n ?? 0).toFixed(2)}`;

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>🧾 Credit Approval</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Approve a customer for a credit account + set limit/terms.</div></div>
          <Link href="/founder" style={pill}>← Founder</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        <form onSubmit={(e) => { e.preventDefault(); load(q); }} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer by name or phone…" style={{ ...input, flex: 1 }} />
          <button type="submit" style={{ ...pill, cursor: 'pointer', background: GOLD, color: INK, fontWeight: 800 }}>Search</button>
        </form>
        {!q && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Showing current credit customers. Search to approve a new one.</div>}

        {rows.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No customers.</div>}

        {rows.map((c) => {
          const d = draftFor(c);
          const util = c.is_credit_customer && Number(c.credit_limit) > 0 ? Math.round((Number(c.current_balance ?? 0) / Number(c.credit_limit)) * 100) : 0;
          return (
            <div key={c.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{c.full_name || 'Customer'} {c.is_credit_customer && <span style={{ fontSize: 11, color: '#4ade80' }}>● credit</span>}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.phone || 'no phone'}{c.is_credit_customer ? ` · balance ${money(c.current_balance)} / ${money(c.credit_limit)} (${util}%)` : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div><div style={lbl}>Limit (BSD)</div><input value={d.limit} onChange={(e) => setDraft(c.id, 'limit', e.target.value)} inputMode="decimal" placeholder="0" style={{ ...input, width: 110 }} /></div>
                <div><div style={lbl}>Terms</div>
                  <select value={d.terms} onChange={(e) => setDraft(c.id, 'terms', e.target.value)} style={{ ...input, width: 110 }}>{TERMS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div style={{ flex: 1 }} />
                <button onClick={() => save(c, true)} disabled={busy === c.id} style={{ ...pill, cursor: 'pointer', background: GOLD, color: INK, fontWeight: 800 }}>{busy === c.id ? '…' : c.is_credit_customer ? 'Update' : '✓ Approve credit'}</button>
                {c.is_credit_customer && <button onClick={() => save(c, false)} disabled={busy === c.id} style={{ ...pill, cursor: 'pointer', color: '#f87171', borderColor: '#7f1d1d' }}>Revoke</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' };
const input: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, boxSizing: 'border-box', outline: 'none' };
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
