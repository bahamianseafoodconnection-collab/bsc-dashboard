'use client';

// /founder/wholesale — Wholesale Online Market (sells the full CASE as a unit).
// Counterpart to the per-item Retail Online Market. Lists each product as a case:
// case cost = per-item cost × units-per-case; case price = wholesale per-item
// price × units (or case cost × default margin). Read-only economics + a toggle
// to list/unlist a product on the wholesale channel (sell_wholesale).

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Row = {
  id: string; name: string; supplier: string | null; pack_size: string | null; units_per_case: number | null;
  on_wholesale: boolean; item_cost: number | null; case_cost: number | null; case_price: number | null; case_profit: number | null; margin_pct: number | null;
};
type Resp = {
  ok: boolean;
  summary: { case_products: number; on_wholesale: number; missing_from_wholesale: number; no_case_size: number };
  products: Row[];
};
const bsd = (n: number | null) => n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function WholesaleMarketDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing'>('all');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const tok = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [supabase]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const t = await tok();
      if (!t) { router.push('/staff-login?next=/founder/wholesale'); return; }
      const res = await fetch('/api/founder/wholesale', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setD(j as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [tok, router]);
  useEffect(() => { load(); }, [load]);

  async function listOne(r: Row) {
    const t = await tok();
    const res = await fetch('/api/founder/wholesale/list', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ product_id: r.id, unlist: r.on_wholesale }) });
    const j = await res.json();
    if (!res.ok || !j.ok) { flash(j.error || 'Failed'); return; }
    setD(prev => prev ? { ...prev, products: prev.products.map(x => x.id === r.id ? { ...x, on_wholesale: j.on_wholesale } : x) } : prev);
    flash(j.on_wholesale ? `✓ ${r.name} listed on wholesale` : `${r.name} unlisted`);
  }
  async function listAll() {
    setBusy(true);
    try {
      const t = await tok();
      const res = await fetch('/api/founder/wholesale/list', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ all: true }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { flash(j.error || 'Failed'); return; }
      flash(`✓ Listed ${j.listed} case products on wholesale`); await load();
    } finally { setBusy(false); }
  }

  const rows = (d?.products ?? []).filter(r => filter === 'all' || !r.on_wholesale);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/founder')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 19 }}>📦 Wholesale Online Market</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Sold by the case · case price = per-item wholesale × units</div>
          </div>
          {(d?.summary.missing_from_wholesale ?? 0) > 0 && <button onClick={listAll} disabled={busy} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{busy ? '…' : `List all ${d?.summary.missing_from_wholesale} on wholesale`}</button>}
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠️ {err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Tile label="Case products" value={loading && !d ? '…' : String(d?.summary.case_products ?? 0)} c="#fff" />
          <Tile label="On wholesale" value={loading && !d ? '…' : String(d?.summary.on_wholesale ?? 0)} c="#4ade80" />
          <Tile label="Not yet listed" value={loading && !d ? '…' : String(d?.summary.missing_from_wholesale ?? 0)} c={(d?.summary.missing_from_wholesale ?? 0) > 0 ? '#fbbf24' : '#4ade80'} />
          <Tile label="No case size" value={loading && !d ? '…' : String(d?.summary.no_case_size ?? 0)} c="rgba(255,255,255,0.7)" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'missing'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', border: `1px solid ${filter === f ? GOLD : '#e2e8f0'}`, background: filter === f ? GOLD : '#fff', color: filter === f ? INK : '#475569' }}>{f === 'all' ? 'All cases' : 'Not yet listed'}</button>
          ))}
        </div>

        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, color: '#e2e8f0', minWidth: 720 }}>
              <thead><tr style={{ background: '#0a1220', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Product</th><th style={{ padding: '9px 10px' }}>Case</th><th style={{ padding: '9px 10px' }}>Case cost</th><th style={{ padding: '9px 10px' }}>Case price</th><th style={{ padding: '9px 10px' }}>Margin</th><th style={{ padding: '9px 10px', textAlign: 'center' }}>Wholesale</th>
              </tr></thead>
              <tbody>
                {(loading && !d ? [] : rows).map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '8px 10px', textAlign: 'left' }}>{r.name}{r.supplier ? <span style={{ color: 'rgba(255,255,255,0.35)' }}> · {r.supplier}</span> : null}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>of {r.units_per_case}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{bsd(r.case_cost)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#86efac', fontWeight: 700 }}>{bsd(r.case_price)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{r.margin_pct != null ? `${r.margin_pct}%` : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button onClick={() => listOne(r)} style={{ borderRadius: 6, padding: '3px 9px', fontSize: 10, fontWeight: 800, cursor: 'pointer',
                        border: `1px solid ${r.on_wholesale ? 'rgba(34,197,94,0.5)' : 'rgba(251,191,36,0.5)'}`,
                        background: r.on_wholesale ? 'rgba(34,197,94,0.16)' : 'rgba(251,191,36,0.14)',
                        color: r.on_wholesale ? '#4ade80' : '#fbbf24' }}>{r.on_wholesale ? '✓ listed' : '+ list'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{filter === 'missing' ? 'Every case product is listed on wholesale 🎉' : 'No case products.'}</div>}
        </section>
        <p style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>Case price = wholesale per-item price × units per case. Setting the per-item retail price (Retail dashboard) feeds both. The main store&apos;s quantity auto-upgrade is unchanged.</p>
      </main>
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0f1a2e', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, zIndex: 80, border: `1px solid ${GOLD}` }}>{toast}</div>}
    </div>
  );
}

function Tile({ label, value, c }: { label: string; value: string; c: string }) {
  return <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 14 }}><div style={{ color: c, fontWeight: 900, fontSize: 20 }}>{value}</div><div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{label}</div></div>;
}
