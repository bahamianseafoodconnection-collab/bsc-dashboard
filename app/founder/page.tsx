'use client';

// /founder — the Founder oversight home.
//
// Full company at a glance + one-tap access to EVERY role dashboard and the
// Founder AI daily briefing. Headline numbers come from /api/founder/dashboard
// (founder-only, server-authoritative); the full narrative brief lives at
// /founder-ai.

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import MyDirectives from '@/components/directives/MyDirectives';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Dash = {
  ok: boolean;
  founder: { name: string | null; role: string };
  sales: { today: { orders: number; revenue: number; net_profit: number }; yesterday: { orders: number; revenue: number }; channels: { channel: string; orders: number; revenue: number }[] } | null;
  fulfillment: { cod_outstanding: number | null; cod_collected_today: number | null; deliveries_active: number | null };
  operations: { new_pos_today: number | null; credit_due: number | null; low_stock: number | null };
  haccp: { active_lots: number | null; pending_qc: number | null; temp_excursions_today: number | null; open_capas: number | null };
};

const money = (n: number | null | undefined) => n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined) => n == null ? '—' : String(n);
const CHANNEL_LABEL: Record<string, string> = { nassau_pos: 'POS Nassau', andros_pos: 'POS Andros', online_market: 'Retail Online Market', whatsapp: 'WhatsApp', online: 'Online', other: 'Other' };

export default function FounderDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push('/staff-login?next=/founder'); return; }
      const res = await fetch('/api/founder/dashboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setData(j as Dash);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Nassau', weekday: 'long', month: 'long', day: 'numeric' });
  const firstName = (data?.founder.name || '').split(' ')[0] || 'Founder';

  const revToday = data?.sales?.today.revenue ?? null;
  const revYest = data?.sales?.yesterday.revenue ?? null;
  const delta = revToday != null && revYest != null && revYest > 0 ? Math.round(((revToday - revYest) / revYest) * 100) : null;

  // Every dashboard the founder can drop into.
  const dashboards: { label: string; desc: string; href: string; icon: string }[] = [
    { label: 'Founder AI Briefing', desc: 'Full daily narrative + P&L', href: '/founder-ai',       icon: '🤖' },
    { label: 'Bank Reconciliation', desc: 'System totals vs bank',       href: '/founder/bank',     icon: '🏦' },
    { label: 'RBC Payment Confirm', desc: 'Auto-match daily RBC report',  href: '/founder/rbc',      icon: '💳' },
    { label: 'Retail Online Market',desc: 'Per item · movers · prices',   href: '/founder/retail',   icon: '🛒' },
    { label: 'Wholesale Online Mkt', desc: 'Sold by the case',            href: '/founder/wholesale',icon: '📦' },
    { label: 'Channel Margins',      desc: '6 channels · markups',         href: '/founder/channels', icon: '📊' },
    { label: 'Paid Orders → Suppliers', desc: 'RBC-paid · grouped · route', href: '/founder/paid-orders',  icon: '🧾' },
    { label: 'Daily Sales + Profit', desc: 'POS daily · supplier profit',  href: '/dashboard/daily-sales', icon: '📈' },
    { label: 'Slow Movers',          desc: 'Keep · discount · cut',        href: '/founder/slow-movers',  icon: '🐌' },
    { label: 'Invoice → Catalog',    desc: 'Add new SKUs from an invoice',  href: '/founder/invoice-import', icon: '📥' },
    { label: 'Phone Orders',         desc: 'Approve · route · print',      href: '/founder/phone-orders', icon: '📞' },
    { label: 'Directives',           desc: 'Assign tasks + duties to staff', href: '/founder/directives',  icon: '📋' },
    { label: 'Payment Approvals',    desc: 'Hold / approve pending payments', href: '/founder/payment-approvals', icon: '🔐' },
    { label: 'Control Center',      desc: 'All 80+ admin tools',        href: '/dashboard',        icon: '🎛️' },
    { label: 'Cashier',             desc: 'POS, orders, invoices',      href: '/cashier',          icon: '🧾' },
    { label: 'Supplier Handler',    desc: 'Suppliers, catalogue',       href: '/supplier-handler', icon: '🏪' },
    { label: 'Driver',              desc: 'Pickups & deliveries',       href: '/driver',           icon: '🚚' },
    { label: 'Spiny Tail Processor',desc: 'HACCP, lots, freezer',       href: '/spinytails',       icon: '🦞' },
  ];

  const ops: { label: string; value: string; href: string; alert?: boolean }[] = [
    { label: 'COD outstanding',        value: num(data?.fulfillment.cod_outstanding),    href: '/orders',          alert: (data?.fulfillment.cod_outstanding ?? 0) > 0 },
    { label: 'COD collected today',    value: num(data?.fulfillment.cod_collected_today),href: '/orders' },
    { label: 'Deliveries in progress', value: num(data?.fulfillment.deliveries_active),  href: '/driver' },
    { label: 'New POs today',          value: num(data?.operations.new_pos_today),       href: '/purchase-orders' },
    { label: 'Credit accounts due',    value: num(data?.operations.credit_due),          href: '/credit',          alert: (data?.operations.credit_due ?? 0) > 0 },
    { label: 'Active lots',            value: num(data?.haccp.active_lots),              href: '/spinytails' },
    { label: 'QC pending',             value: num(data?.haccp.pending_qc),               href: '/spinytails',      alert: (data?.haccp.pending_qc ?? 0) > 0 },
    { label: 'Temp excursions today',  value: num(data?.haccp.temp_excursions_today),    href: '/spinytails',      alert: (data?.haccp.temp_excursions_today ?? 0) > 0 },
    { label: 'Open CAPAs',             value: num(data?.haccp.open_capas),               href: '/spinytails',      alert: (data?.haccp.open_capas ?? 0) > 0 },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 20 }}>Good day, {firstName} 👑</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Founder oversight · {today}</div>
          </div>
          <button onClick={() => router.push('/founder-ai')}
            style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
            🤖 Daily Briefing
          </button>
          <button onClick={load} disabled={loading}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
      </header>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 16px' }}><MyDirectives /></div>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && (
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            ⚠️ {err} <button onClick={load} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>retry</button>
          </div>
        )}

        {/* Sales headline */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 16 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 900, marginBottom: 12 }}>Today’s sales</div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>{loading && !data ? '…' : money(revToday)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                {num(data?.sales?.today.orders)} orders
                {delta != null && <span style={{ marginLeft: 8, color: delta >= 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs yest</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4ade80' }}>{loading && !data ? '…' : money(data?.sales?.today.net_profit)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>net profit today</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'rgba(255,255,255,0.8)' }}>{loading && !data ? '…' : money(revYest)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>yesterday</div>
            </div>
          </div>
          {/* per-channel */}
          {data?.sales && data.sales.channels.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {data.sales.channels.map(c => (
                <div key={c.channel} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{CHANNEL_LABEL[c.channel] ?? c.channel}: </span>
                  <span style={{ color: GOLD, fontWeight: 800 }}>{money(c.revenue)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {c.orders}</span>
                </div>
              ))}
            </div>
          )}
          {data && !data.sales && <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 8 }}>Sales figures unavailable right now.</div>}
        </section>

        {/* Operational + HACCP watch */}
        <section>
          <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Watch list</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {ops.map(o => (
              <button key={o.label} onClick={() => router.push(o.href)}
                style={{ background: '#fff', borderRadius: 12, border: `1px solid ${o.alert ? 'rgba(248,113,113,0.5)' : '#e2e8f0'}`, padding: 14, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: o.alert ? '#dc2626' : INK }}>{loading && !data ? '·' : o.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{o.label}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Jump into any dashboard */}
        <section>
          <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Open any dashboard</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {dashboards.map(d => (
              <button key={d.label} onClick={() => router.push(d.href)}
                style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14, textAlign: 'left', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 22 }}>{d.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: INK, marginTop: 6 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.desc}</div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
