'use client';

// app/founder/slow-movers/page.tsx
//
// Monthly slow-moving products report. Every active product with its units sold
// + revenue over the window, velocity flag (STALLED / SLOW / OK), slowest first.
// Founder decides keep / discount / eliminate. CSV export.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Row = { product_id: string; name: string; sku: string | null; category: string | null; supplier_name: string; units_sold: number; revenue: number; last_sold: string | null; velocity: 'stalled' | 'slow' | 'ok' };
type Resp = { ok: boolean; window_days: number; slow_under: number; counts: { total: number; stalled: number; slow: number }; rows: Row[]; error?: string };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const FLAG: Record<string, { label: string; color: string }> = {
  stalled: { label: 'STALLED', color: '#dc2626' },
  slow: { label: 'SLOW', color: '#d97706' },
  ok: { label: 'OK', color: '#16a34a' },
};

export default function SlowMoversPage() {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<'all' | 'stalled' | 'slow'>('all');
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true); setError(null);
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch(`/api/founder/slow-movers?days=${d}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = (await res.json().catch(() => ({}))) as Resp;
    if (!res.ok || !j.ok) { setError(j.error || `Failed (HTTP ${res.status})`); setData(null); }
    else setData(j);
    setLoading(false);
  }, []);
  useEffect(() => { load(days); }, [days, load]);

  const shown = (data?.rows ?? []).filter((r) => filter === 'all' || r.velocity === filter);

  function downloadCsv() {
    if (!data) return;
    const head = ['Product', 'SKU', 'Supplier', 'Category', `Units (${data.window_days}d)`, 'Revenue', 'Last sold', 'Velocity'];
    const rows = shown.map((r) => [r.name, r.sku ?? '', r.supplier_name, r.category ?? '', String(r.units_sold), r.revenue.toFixed(2), r.last_sold ? new Date(r.last_sold).toLocaleDateString() : 'never', r.velocity]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bsc-slow-movers-${data.window_days}d.csv`; a.click();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>🐌 Slow-Moving Products</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Keep / discount / eliminate. Slowest first; includes zero-sale (stalled) items.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {[30, 60, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} style={{ ...pill, background: days === d ? GOLD : 'transparent', color: days === d ? INK : '#cbd5e1', fontWeight: 800 }}>{d}d</button>
            ))}
            <button onClick={downloadCsv} disabled={!data || shown.length === 0} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: shown.length ? 1 : 0.4 }}>⬇ CSV</button>
            <Link href="/dashboard" style={pill}>← Dashboard</Link>
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading…</div> : data && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {([['all', `All (${data.counts.total})`], ['stalled', `Stalled (${data.counts.stalled})`], ['slow', `Slow (${data.counts.slow})`]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setFilter(v)} style={{ ...pill, background: filter === v ? '#0d1f3c' : 'transparent', color: filter === v ? GOLD : '#cbd5e1', border: `1px solid ${filter === v ? GOLD : BORDER}` }}>{label}</button>
              ))}
            </div>

            <div style={{ overflowX: 'auto', background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
                <thead><tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                  <th style={th}>Product</th><th style={th}>Supplier</th><th style={th}>Category</th>
                  <th style={{ ...th, textAlign: 'right' }}>Units {data.window_days}d</th><th style={{ ...th, textAlign: 'right' }}>Revenue</th><th style={th}>Last sold</th><th style={th}>Velocity</th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const f = FLAG[r.velocity];
                    return (
                      <tr key={r.product_id} style={{ borderTop: '1px solid #16243f' }}>
                        <td style={td}>{r.name}{r.sku ? <span style={{ color: '#64748b', fontFamily: 'monospace' }}> · {r.sku}</span> : null}</td>
                        <td style={td}>{r.supplier_name}</td>
                        <td style={{ ...td, color: '#94a3b8' }}>{r.category ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{r.units_sold}</td>
                        <td style={{ ...td, textAlign: 'right' }}>${r.revenue.toFixed(2)}</td>
                        <td style={{ ...td, color: '#94a3b8' }}>{r.last_sold ? new Date(r.last_sold).toLocaleDateString() : 'never'}</td>
                        <td style={td}><span style={{ background: f.color, color: '#fff', fontWeight: 800, fontSize: 10, padding: '2px 7px', borderRadius: 4, letterSpacing: 0.5 }}>{f.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown.length === 0 && <div style={{ color: '#64748b', padding: 12 }}>No products in this filter.</div>}
          </>
        )}
      </div>
    </div>
  );
}
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', background: 'transparent' };
const th: React.CSSProperties = { padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '7px 10px', color: '#e2e8f0' };
