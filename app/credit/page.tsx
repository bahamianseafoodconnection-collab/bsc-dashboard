'use client';

// /credit — Customer Credit Accounts overview.
//
// Portfolio view of every approved credit account: limit, balance, available
// credit, utilisation, and over-limit flags, plus totals. Each row opens the
// existing per-customer detail (/dashboard/customers/[id]) for management —
// set limit/terms, record a payment, view the ledger. Read data from
// /api/credit/accounts (founder/manager/cashier).

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Account = {
  id: string; name: string | null; phone: string | null; terms: string | null;
  limit: number; balance: number; available: number; utilization: number;
  over_limit: boolean; owing: boolean; total_orders: number; total_spent: number;
};
type Resp = {
  ok: boolean;
  role: string;
  canManage: boolean;
  summary: { accounts: number; total_outstanding: number; total_limit: number; over_limit: number; owing: number };
  accounts: Account[];
};

const bsd = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CreditAccountsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'owing' | 'over'>('all');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push('/staff-login?next=/credit'); return; }
      const res = await fetch('/api/credit/accounts', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setData(j as Resp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    let a = data?.accounts ?? [];
    if (filter === 'owing') a = a.filter(x => x.owing);
    if (filter === 'over') a = a.filter(x => x.over_limit);
    const s = q.trim().toLowerCase();
    if (s) a = a.filter(x => (x.name ?? '').toLowerCase().includes(s) || (x.phone ?? '').includes(s));
    return a;
  }, [data, filter, q]);

  const sum = data?.summary;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.back()} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 19 }}>🅒 Credit Accounts</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Approved credit customers · balances & limits</div>
          </div>
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && (
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            ⚠️ {err} <button onClick={load} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>retry</button>
          </div>
        )}

        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <SummaryTile label="Outstanding" value={loading && !data ? '…' : bsd(sum?.total_outstanding ?? 0)} accent="#f87171" />
          <SummaryTile label="Accounts" value={loading && !data ? '…' : String(sum?.accounts ?? 0)} accent="#fff" />
          <SummaryTile label="Owing now" value={loading && !data ? '…' : String(sum?.owing ?? 0)} accent={GOLD} />
          <SummaryTile label="Over limit" value={loading && !data ? '…' : String(sum?.over_limit ?? 0)} accent={(sum?.over_limit ?? 0) > 0 ? '#f87171' : '#4ade80'} />
          <SummaryTile label="Total limits" value={loading && !data ? '…' : bsd(sum?.total_limit ?? 0)} accent="rgba(255,255,255,0.8)" />
        </div>

        {/* Filter + search */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['all', 'owing', 'over'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                border: `1px solid ${filter === f ? GOLD : '#e2e8f0'}`, background: filter === f ? GOLD : '#fff', color: filter === f ? INK : '#475569' }}>
              {f === 'all' ? 'All' : f === 'owing' ? 'Owing' : 'Over limit'}
            </button>
          ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / phone…"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </div>

        {/* Accounts list */}
        <div style={{ background: CARD, borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          {loading && !data ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              {data && data.accounts.length === 0 ? 'No credit accounts yet. Approve a customer for credit on their profile.' : 'No matches.'}
            </div>
          ) : rows.map((a) => {
            const barColor = a.over_limit ? '#f87171' : a.utilization >= 80 ? '#fbbf24' : '#4ade80';
            return (
              <button key={a.id} onClick={() => { if (data?.canManage) router.push(`/dashboard/customers/${a.id}`); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: `1px solid ${BORDER}`, padding: '12px 14px', cursor: data?.canManage ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>{a.name || '(no name)'}</span>
                    {a.terms && <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginLeft: 8 }}>{a.terms}</span>}
                    {a.over_limit && <span style={{ color: '#f87171', fontSize: 10, fontWeight: 900, marginLeft: 8 }}>OVER LIMIT</span>}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ color: a.balance > 0 ? GOLD : 'rgba(255,255,255,0.6)', fontWeight: 900, fontSize: 14 }}>{bsd(a.balance)}</div>
                    <div style={{ color: a.available < 0 ? '#f87171' : 'rgba(255,255,255,0.45)', fontSize: 10 }}>{bsd(a.available)} available</div>
                  </div>
                </div>
                {/* utilisation bar */}
                <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, a.utilization)}%`, height: '100%', background: barColor }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{a.phone || '—'} · limit {bsd(a.limit)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{a.utilization}% used · {a.total_orders} orders</span>
                </div>
              </button>
            );
          })}
        </div>
        {data?.canManage
          ? <p style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>Tap an account to set its limit/terms, record a payment, or view its ledger.</p>
          : <p style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>Check a customer’s available credit before placing a credit order. A manager sets limits & records payments.</p>}
      </main>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 14 }}>
      <div style={{ color: accent, fontWeight: 900, fontSize: 20 }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}
