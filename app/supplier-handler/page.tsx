'use client';

// /supplier-handler — the Supplier Handler "electronic handbook" dashboard.
//
// Login home for the staff member who manages suppliers: add suppliers, upload
// pricelists, extract + approve products, keep availability + photos current.
// Shows job, live "to do" counts (each links to where the work happens — the
// /supplier hub), the forms, and a summary. Counts come from
// /api/supplier-handler/dashboard (server-authoritative).

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f4c842';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Dash = {
  ok: boolean;
  handler: { id: string; name: string | null; role: string };
  today: {
    new_suppliers: number | null;
    pricelists_missing: number | null;
    products_awaiting_extraction: number | null;
    products_pending_approval: number | null;
    products_missing_photos: number | null;
    products_off_all_channels: number | null;
  };
  summary: { active_suppliers: number | null; live_products: number | null };
};

const JOB = [
  'Add new suppliers to the system',
  'Upload supplier price lists',
  'Extract & approve products from pricelists',
  'Switch products ON/OFF as stock changes at the supplier',
  'Upload product photos for the online market',
];

export default function SupplierHandlerDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push('/staff-login?next=/supplier-handler'); return; }
      const res = await fetch('/api/supplier-handler/dashboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
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
  const firstName = (data?.handler.name || '').split(' ')[0] || 'there';

  const todoRows: { key: string; label: string; value: number | null; href: string; cta: string }[] = data ? [
    { key: 'new_suppliers',  label: 'New suppliers to review / activate',     value: data.today.new_suppliers,                href: '/supplier', cta: 'Review' },
    { key: 'pricelists',     label: 'Active suppliers missing a pricelist',   value: data.today.pricelists_missing,           href: '/supplier', cta: 'Upload pricelist' },
    { key: 'extraction',     label: 'Pricelists uploaded, products not yet extracted', value: data.today.products_awaiting_extraction, href: '/supplier', cta: 'Extract' },
    { key: 'approval',       label: 'Products awaiting approval',             value: data.today.products_pending_approval,    href: '/supplier', cta: 'Approve' },
    { key: 'photos',         label: 'Live products missing a photo',          value: data.today.products_missing_photos,      href: '/supplier-handler/photos', cta: 'Add photos' },
    { key: 'off_channels',   label: 'Active products switched off everywhere (out of stock?)', value: data.today.products_off_all_channels, href: '/supplier', cta: 'Set availability' },
  ] : [];

  const forms: { label: string; desc: string; href: string; icon: string }[] = [
    { label: 'Add Supplier',     desc: 'Register a new supplier',     href: '/supplier', icon: '🏪' },
    { label: 'Upload Pricelist', desc: 'Attach a supplier pricelist', href: '/supplier', icon: '📄' },
    { label: 'Approve Products', desc: 'Review extracted products',   href: '/supplier', icon: '✅' },
    { label: 'Availability',     desc: 'Switch products ON / OFF',    href: '/supplier', icon: '🔌' },
    { label: 'Product Photos',   desc: 'Upload + crop for online',    href: '/supplier-handler/photos', icon: '📷' },
  ];

  const totalToDo = todoRows.reduce((s, r) => s + (r.value ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 20 }}>Hi {firstName} 👋</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Supplier Handler · {today}</div>
          </div>
          <button onClick={() => router.push('/supplier')}
            style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
            🏪 Suppliers
          </button>
          <button onClick={load} disabled={loading}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && (
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            ⚠️ {err} <button onClick={load} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>retry</button>
          </div>
        )}

        {/* Things to do today */}
        <section style={{ background: CARD, borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>✅ Things to do today</div>
            <div style={{ color: totalToDo > 0 ? GOLD : '#4ade80', fontWeight: 900, fontSize: 13 }}>
              {loading ? '…' : totalToDo > 0 ? `${totalToDo} open` : 'All clear 🎉'}
            </div>
          </div>
          <div>
            {(loading && !data ? Array.from({ length: 6 }) : todoRows).map((row, i) => {
              const r = row as typeof todoRows[number] | undefined;
              const v = r?.value ?? null;
              const done = v === 0;
              return (
                <button key={r?.key ?? i} onClick={() => r && router.push(r.href)} disabled={!r}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '12px 16px', border: 'none', borderTop: `1px solid ${BORDER}`,
                    background: 'transparent', cursor: r ? 'pointer' : 'default',
                  }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 13,
                    background: v == null ? 'rgba(255,255,255,0.06)' : done ? 'rgba(34,197,94,0.18)' : 'rgba(244,200,66,0.18)',
                    color: v == null ? 'rgba(255,255,255,0.4)' : done ? '#4ade80' : GOLD,
                    border: `1px solid ${v == null ? 'rgba(255,255,255,0.12)' : done ? 'rgba(34,197,94,0.4)' : 'rgba(244,200,66,0.4)'}`,
                  }}>{loading && !data ? '·' : v == null ? '—' : done ? '✓' : v}</span>
                  <span style={{ flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{r?.label ?? '…'}</span>
                  {r && !done && v != null && (
                    <span style={{ color: GOLD, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{r.cta} →</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Forms / quick actions */}
        <section>
          <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Forms</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {forms.map(f => (
              <button key={f.label} onClick={() => router.push(f.href)}
                style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14, textAlign: 'left', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 22 }}>{f.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: INK, marginTop: 6 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{f.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Summary + Job description */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Catalogue health</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, color: INK }}>{data?.summary.active_suppliers ?? '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>active suppliers</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#16a34a' }}>{data?.summary.live_products ?? '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>products live</div>
              </div>
            </div>
          </section>

          <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Your job</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', fontSize: 12.5, lineHeight: 1.7 }}>
              {JOB.map(j => <li key={j}>{j}</li>)}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
