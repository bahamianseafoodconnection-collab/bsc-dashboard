'use client';

// /cashier — the Cashier "electronic handbook" dashboard.
//
// The login home for the `cashier` role (middleware redirects here). Designed so
// a cashier never has to remember procedures: it shows WHO they are, WHAT their
// job is, WHAT needs doing today (live counts), the FORMS to complete, and a
// performance summary. Every "to do" row links straight to the surface that
// does the work. Counts come from /api/cashier/dashboard (server-authoritative).

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import MyDirectives from '@/components/directives/MyDirectives';
import { clearSignIn } from '@/lib/staff-session';

const GOLD = '#f4c842';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Dash = {
  ok: boolean;
  cashier: { id: string; name: string | null; role: string };
  today: {
    new_orders: number | null;
    awaiting_payment: number | null;
    cod_awaiting_dispatch: number | null;
    credit_awaiting_approval: number | null;
    invoices_to_convert: number | null;
    unpaid_purchase_invoices: number | null;
  };
  performance: { today_sales_count: number | null; today_sales_total: number | null };
};

const JOB = [
  'Process sales at POS Nassau & POS Andros',
  'Receive customer orders (phone / WhatsApp)',
  'Upload supplier invoice photos → purchase orders',
  'Process COD orders',
  'Process credit-customer orders (within approved limit)',
];

export default function CashierDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function signOut() {
    clearSignIn();
    await supabase.auth.signOut();
    router.replace('/staff-login');
  }

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push('/staff-login?next=/cashier'); return; }
      const res = await fetch('/api/cashier/dashboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
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
  const firstName = (data?.cashier.name || '').split(' ')[0] || 'Cashier';

  // The live "to do" rows. value=null → "—" (a count couldn't be computed).
  const todoRows: { key: string; label: string; value: number | null; href: string; cta: string }[] = data ? [
    { key: 'new_orders',     label: 'New / pending customer orders',     value: data.today.new_orders,               href: '/orders',            cta: 'Open orders' },
    { key: 'awaiting_pay',   label: 'Orders awaiting payment',           value: data.today.awaiting_payment,         href: '/orders',            cta: 'Collect payment' },
    { key: 'cod',            label: 'COD orders awaiting dispatch',      value: data.today.cod_awaiting_dispatch,    href: '/pickup-queue',      cta: 'Dispatch' },
    { key: 'credit',         label: 'Credit orders awaiting approval',   value: data.today.credit_awaiting_approval, href: '/credit',            cta: 'Review' },
    { key: 'invoices',       label: 'Invoices to turn into purchase orders', value: data.today.invoices_to_convert, href: '/documents/capture', cta: 'Upload / convert' },
    { key: 'supplier_bills', label: 'Supplier bills still owed',         value: data.today.unpaid_purchase_invoices, href: '/purchase-orders',   cta: 'Open POs' },
  ] : [];

  const forms: { label: string; desc: string; href: string; icon: string }[] = [
    { label: 'New Sale',           desc: 'Ring up at POS Nassau',          href: '/pos',               icon: '🧾' },
    { label: 'Andros Sale',        desc: 'Ring up at POS Andros',          href: '/pos-andros',        icon: '🏝️' },
    { label: 'Phone Order',        desc: 'Take a phone / WhatsApp order',  href: '/phone-order',       icon: '📞' },
    { label: 'Add Customer',       desc: 'New / returning · phone-matched', href: '/cashier/add-customer', icon: '👤' },
    { label: 'Orders',             desc: 'View · collect payment',         href: '/orders',            icon: '📋' },
    { label: 'Scan Invoice',       desc: 'Photo → purchase order / expense', href: '/documents/capture', icon: '📸' },
    { label: 'Expenses',           desc: 'View · add expenses',            href: '/expenses',          icon: '💸' },
    { label: 'Purchase Order',     desc: 'Create / view supplier POs',     href: '/purchase-orders',   icon: '📦' },
  ];

  const totalToDo = todoRows.reduce((s, r) => s + (r.value ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 20 }}>Good day, {firstName} 👋</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Cashier · {today}</div>
          </div>
          <button onClick={() => router.push('/pos')}
            style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
            🧾 Open Register
          </button>
          <button onClick={() => router.push('/cashier/phone-orders')}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            title="Approved phone orders — print invoices">
            📞 Phone orders
          </button>
          <button onClick={() => router.push('/account/password')}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            title="Change your password">
            🔑 Password
          </button>
          <button onClick={load} disabled={loading}
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {loading ? '…' : '↻'}
          </button>
          <button onClick={signOut}
            style={{ background: 'transparent', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 10, padding: '10px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            title="Sign out">
            ⎋ Sign out
          </button>
        </div>
      </header>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 16px' }}><MyDirectives /></div>

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

        {/* Performance + Job description */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Your day so far</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, color: INK }}>{data?.performance.today_sales_count ?? '—'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>sales rung up</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#16a34a' }}>
                  {data?.performance.today_sales_total != null ? `$${data.performance.today_sales_total.toFixed(2)}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>total taken</div>
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
