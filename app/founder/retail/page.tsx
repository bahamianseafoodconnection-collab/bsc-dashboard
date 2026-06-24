'use client';

// /founder/retail — Retail Online Market dashboard.
//
// Channel-scoped analytics for the retail online channel (display name "Retail
// Online Market"; enum stays online_market). Case→unit economics, fast/slow
// movers, supplier price changes, reorder recommendations, founder alerts.
// Read-only — changes no pricing math. Data from /api/founder/retail.

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Row = {
  id: string; name: string; supplier: string | null;
  unit_cost: number | null; retail_price: number | null; units_per_case: number | null;
  case_cost: number | null; profit_per_unit: number | null; profit_per_case: number | null; margin_pct: number | null;
  stock_count: number | null; cases_remaining: number | null; units_remaining: number | null;
  pack_size: string | null; sold_1d: number; sold_7d: number; sold_30d: number; revenue_30d: number; profit_30d: number;
};
type Change = { id: string; name: string; supplier: string | null; old_cost: number; new_cost: number; diff: number; direction: string; changed_at: string | null };
type Reorder = { id: string; name: string; supplier: string | null; units_remaining: number | null; units_per_case: number | null; recommend_cases: number | null; velocity_7d: number };
type Alert = { type: string; severity: 'warn' | 'info'; message: string };
type Resp = {
  ok: boolean; channel_label: string;
  summary: { products: number; units_sold_30d: number; revenue_30d: number; profit_30d: number };
  movers: { fast: Row[]; slow: Row[] };
  price_changes: Change[]; reorders: Reorder[]; alerts: Alert[]; products: Row[];
};

const bsd = (n: number | null) => n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => n == null ? '—' : `${n}%`;

export default function RetailMarketDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push('/staff-login?next=/founder/retail'); return; }
      const res = await fetch('/api/founder/retail', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setD(j as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [supabase, router]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/founder')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 19 }}>🛒 Retail Online Market</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Case→unit economics · movers · supplier price changes · reorder</div>
          </div>
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠️ {err}</div>}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Tile label="Retail products" value={loading && !d ? '…' : String(d?.summary.products ?? 0)} c="#fff" />
          <Tile label="Units sold · 30d" value={loading && !d ? '…' : String(d?.summary.units_sold_30d ?? 0)} c={GOLD} />
          <Tile label="Revenue · 30d" value={loading && !d ? '…' : bsd(d?.summary.revenue_30d ?? 0)} c="#86efac" />
          <Tile label="Profit · 30d" value={loading && !d ? '…' : bsd(d?.summary.profit_30d ?? 0)} c="#4ade80" />
        </div>

        {/* Alerts */}
        {(d?.alerts.length ?? 0) > 0 && (
          <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
            <SecTitle>🔔 Founder alerts</SecTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {d!.alerts.map((a, i) => (
                <div key={i} style={{ fontSize: 12.5, color: a.severity === 'warn' ? '#fbbf24' : '#93c5fd', display: 'flex', gap: 6 }}>
                  <span>{a.severity === 'warn' ? '⚠️' : 'ℹ️'}</span><span>{a.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Movers + Supplier price changes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
            <SecTitle>🚀 Fast moving (30d)</SecTitle>
            {(d?.movers.fast.length ?? 0) === 0 ? <Empty>No sales yet.</Empty> : d!.movers.fast.map((r, i) => (
              <div key={r.id} style={rowS}>
                <span style={{ color: 'rgba(255,255,255,0.4)', width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ color: GOLD, fontWeight: 800, fontSize: 12 }}>{r.sold_30d} sold</span>
                <span style={{ color: '#4ade80', fontSize: 11, width: 64, textAlign: 'right' }}>{bsd(r.profit_30d)}</span>
              </div>
            ))}
          </section>
          <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
            <SecTitle>📈 Supplier price changes</SecTitle>
            {(d?.price_changes.length ?? 0) === 0 ? <Empty>No recent cost changes.</Empty> : d!.price_changes.map((c) => (
              <div key={c.id} style={rowS}>
                <span style={{ color: c.direction === 'up' ? '#f87171' : '#4ade80', fontWeight: 900 }}>{c.direction === 'up' ? '↑' : '↓'}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{bsd(c.old_cost)} → <span style={{ color: '#fff', fontWeight: 700 }}>{bsd(c.new_cost)}</span></span>
              </div>
            ))}
          </section>
        </div>

        {/* Reorder recommendations */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
          <SecTitle>📦 Reorder recommendations (by case)</SecTitle>
          {(d?.reorders.length ?? 0) === 0 ? <Empty>Nothing low on stock.</Empty> : d!.reorders.map((r) => (
            <div key={r.id} style={rowS}>
              <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}{r.supplier ? <span style={{ color: 'rgba(255,255,255,0.35)' }}> · {r.supplier}</span> : null}</span>
              <span style={{ color: '#f87171', fontSize: 11.5, fontWeight: 700 }}>{r.units_remaining ?? '—'} left</span>
              <span style={{ color: GOLD, fontSize: 11.5, fontWeight: 800, width: 110, textAlign: 'right' }}>{r.recommend_cases ? `reorder ${r.recommend_cases} case${r.units_per_case ? ` (${r.units_per_case}u)` : ''}` : 'set case size'}</span>
            </div>
          ))}
        </section>

        {/* Per-product economics */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px' }}><SecTitle>💰 Retail economics</SecTitle></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, color: '#e2e8f0', minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#0a1220', textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Product</th>
                  <th style={th}>Unit cost</th><th style={th}>Case cost</th><th style={th}>Retail $</th>
                  <th style={th}>Profit/unit</th><th style={th}>Margin</th><th style={th}>Sold 30d</th><th style={th}>Stock</th><th style={th}>Cases left</th>
                </tr>
              </thead>
              <tbody>
                {(loading && !d ? [] : d?.products ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ ...td, textAlign: 'left' }}>{r.name}{r.units_per_case ? <span style={{ color: 'rgba(255,255,255,0.35)' }}> · {r.units_per_case}/case</span> : null}</td>
                    <td style={td}>{bsd(r.unit_cost)}</td>
                    <td style={td}>{bsd(r.case_cost)}</td>
                    <td style={{ ...td, color: '#86efac', fontWeight: 700 }}>{bsd(r.retail_price)}</td>
                    <td style={{ ...td, color: '#4ade80' }}>{bsd(r.profit_per_unit)}</td>
                    <td style={{ ...td, color: r.margin_pct != null && r.margin_pct < 10 ? '#f87171' : '#e2e8f0' }}>{pct(r.margin_pct)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.sold_30d}</td>
                    <td style={td}>{r.stock_count ?? '—'}</td>
                    <td style={td}>{r.cases_remaining ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(d?.products.length ?? 0) === 0 && !loading && <Empty>No retail products.</Empty>}
        </section>
        <p style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>Read-only analytics — pricing math + margins are unchanged. Set a product&apos;s case size on its supplier page to enable case economics.</p>
      </main>
    </div>
  );
}

const th: React.CSSProperties = { padding: '9px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' };
const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderTop: '1px solid rgba(255,255,255,0.05)' };
function Tile({ label, value, c }: { label: string; value: string; c: string }) {
  return <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 14 }}><div style={{ color: c, fontWeight: 900, fontSize: 20 }}>{value}</div><div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{label}</div></div>;
}
function SecTitle({ children }: { children: React.ReactNode }) { return <div style={{ color: '#fff', fontWeight: 900, fontSize: 14 }}>{children}</div>; }
function Empty({ children }: { children: React.ReactNode }) { return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '10px 2px' }}>{children}</div>; }
