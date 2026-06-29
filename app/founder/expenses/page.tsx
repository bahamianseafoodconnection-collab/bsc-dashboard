'use client';

// app/founder/expenses/page.tsx  (G3)
//
// Founder approval queue for staff-captured expenses. Cashier photos a
// receipt → it lands here as pending → founder approves (counts in
// accounting) or rejects.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Expense = {
  id: string; created_at: string; category: string | null; vendor: string | null;
  amount: number | null; amount_bsd: number | null; due_date: string | null;
  description: string | null; notes: string | null; image_url: string | null;
  status: string; approved_at: string | null;
};

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const TABS = ['pending_approval', 'approved', 'rejected', 'all'] as const;
const tabLabel = (t: string) => ({ pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected', all: 'All' } as Record<string, string>)[t] ?? t;

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function FounderExpensesPage() {
  const [tab, setTab] = useState<typeof TABS[number]>('pending_approval');
  const [rows, setRows] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const j = await api(`/api/founder/expenses?status=${tab}`);
    if (!j.ok) { setError(j.error || 'Founder only'); return; }
    setRows(j.expenses as Expense[]);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(`${id}:${action}`);
    const j = await api('/api/founder/expenses', { method: 'POST', body: JSON.stringify({ action, id }) });
    setBusy(null);
    if (!j.ok) { setError(j.error || 'Action failed'); return; }
    load();
  }

  const fmt = (n: number | null) => `$${Number(n ?? 0).toFixed(2)}`;
  const pendingTotal = rows.filter((r) => r.status === 'pending_approval').reduce((s, r) => s + Number(r.amount_bsd ?? r.amount ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>💸 Expense Approvals</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Staff-captured receipts. Approve to count in accounting.</div></div>
          <Link href="/founder" style={pill}>← Founder</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...pill, cursor: 'pointer', background: tab === t ? GOLD : 'transparent', color: tab === t ? INK : '#cbd5e1', fontWeight: tab === t ? 800 : 500 }}>{tabLabel(t)}</button>
          ))}
          {tab === 'pending_approval' && rows.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, color: GOLD, fontWeight: 800 }}>{rows.length} pending · {fmt(pendingTotal)}</span>}
        </div>

        {rows.length === 0 && <div style={{ color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No {tabLabel(tab).toLowerCase()} expenses.</div>}

        {rows.map((e) => (
          <div key={e.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{e.vendor || 'Unknown vendor'}
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>{e.category || 'general'}</span></div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.description || '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{new Date(e.created_at).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: GOLD }}>{fmt(e.amount_bsd ?? e.amount)}</div>
                {e.image_url && <a href={e.image_url} target="_blank" rel="noreferrer" style={{ ...pill, display: 'inline-block', marginTop: 6, color: '#93c5fd', fontSize: 11 }}>🧾 Photo</a>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: e.status === 'approved' ? '#4ade80' : e.status === 'rejected' ? '#f87171' : '#fbbf24', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{e.status.replace('_', ' ')}</span>
              <div style={{ flex: 1 }} />
              {e.status === 'pending_approval' && (
                <>
                  <button onClick={() => act(e.id, 'approve')} disabled={!!busy} style={{ ...btn, background: GOLD, color: INK }}>{busy === `${e.id}:approve` ? '…' : '✓ Approve'}</button>
                  <button onClick={() => act(e.id, 'reject')} disabled={!!busy} style={{ ...btn, color: '#f87171', borderColor: '#7f1d1d' }}>Reject</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
const btn: React.CSSProperties = { fontSize: 12, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' };
