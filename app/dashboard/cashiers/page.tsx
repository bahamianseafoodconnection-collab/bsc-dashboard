'use client';

// /dashboard/cashiers — live view of every cashier's drawer.
//
// Top section: OPEN shifts (real-time payment breakdown per cashier).
// Bottom section: recent CLOSED shifts with variance — sortable by
// date and filterable by cashier. Click any session row to see its
// orders.
//
// Reads cash_drawer_session_totals view + pulls profiles for cashier
// names. Gated to admin / manager / qc-staff roles.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface SessionTotalsRow {
  session_id:                  string;
  cashier_user_id:             string;
  location:                    string;
  status:                      'open' | 'closed';
  opened_at:                   string;
  opening_float_cents:         number;
  closed_at:                   string | null;
  closing_cash_counted_cents:  number | null;
  variance_cents:              number | null;
  cash_sales_cents:            number;
  card_sales_cents:            number;
  wire_sales_cents:            number;
  account_sales_cents:         number;
  total_sales_cents:           number;
  order_count:                 number;
}

interface ProfileMini { id: string; full_name: string | null; role: string | null; }

interface OrderRow {
  id: string;
  created_at: string;
  total: number;
  payment_method: string | null;
  customer_name: string | null;
  status: string;
}

function dollars(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export default function CashiersDashboardPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [open,   setOpen]   = useState<SessionTotalsRow[]>([]);
  const [closed, setClosed] = useState<SessionTotalsRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [drill, setDrill] = useState<{ session: SessionTotalsRow; orders: OrderRow[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/cashiers'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
    })();
  }, []);

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  // Light auto-refresh — every 30s while looking at the dashboard so
  // open sessions update without manual reload.
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    // Open sessions — always all
    const { data: openRows } = await supabase
      .from('cash_drawer_session_totals')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    // Closed in window
    const { data: closedRows } = await supabase
      .from('cash_drawer_session_totals')
      .select('*')
      .eq('status', 'closed')
      .gte('closed_at', `${dateFrom}T00:00:00`)
      .lte('closed_at', `${dateTo}T23:59:59`)
      .order('closed_at', { ascending: false });

    const all = [...((openRows ?? []) as SessionTotalsRow[]), ...((closedRows ?? []) as SessionTotalsRow[])];
    setOpen((openRows ?? []) as SessionTotalsRow[]);
    setClosed((closedRows ?? []) as SessionTotalsRow[]);

    const uids = Array.from(new Set(all.map(r => r.cashier_user_id)));
    if (uids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role').in('id', uids);
      const pm: Record<string, ProfileMini> = {};
      for (const p of (profs ?? []) as ProfileMini[]) pm[p.id] = p;
      setProfiles(pm);
    }
    setLoading(false);
  }

  async function openDrill(row: SessionTotalsRow) {
    setDrillLoading(true);
    setDrill({ session: row, orders: [] });
    const { data } = await supabase
      .from('orders')
      .select('id, created_at, total, payment_method, customer_name, status')
      .eq('cashier_session_id', row.session_id)
      .order('created_at', { ascending: false });
    setDrill({ session: row, orders: (data ?? []) as OrderRow[] });
    setDrillLoading(false);
  }

  const openTotals = useMemo(() => {
    return open.reduce((acc, r) => {
      acc.cash    += r.cash_sales_cents;
      acc.card    += r.card_sales_cents;
      acc.wire    += r.wire_sales_cents;
      acc.account += r.account_sales_cents;
      acc.total   += r.total_sales_cents;
      return acc;
    }, { cash: 0, card: 0, wire: 0, account: 0, total: 0 });
  }, [open]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>💵 Cashier drawers — live</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {open.length} open shift{open.length === 1 ? '' : 's'} · auto-refresh every 30s
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>

        {/* Open shifts summary */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={h2}>🟢 Open shifts</h2>
          {loading && open.length === 0 && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
          {!loading && open.length === 0 && (
            <div style={empty}>No cashiers on shift right now.</div>
          )}
          {open.length > 0 && (
            <>
              <div style={statGrid}>
                <Stat label="Cash"    value={dollars(openTotals.cash)}    accent="#4ade80" />
                <Stat label="Card"    value={dollars(openTotals.card)}    accent="#60a5fa" />
                <Stat label="Wire"    value={dollars(openTotals.wire)}    accent="#a78bfa" />
                <Stat label="Account" value={dollars(openTotals.account)} accent="#fbbf24" />
                <Stat label="Total"   value={dollars(openTotals.total)}   accent="#f5c518" />
              </div>
              <div style={{ marginTop: 12 }}>
                {open.map(s => <SessionCard key={s.session_id} row={s} profile={profiles[s.cashier_user_id]} onOpen={() => openDrill(s)} />)}
              </div>
            </>
          )}
        </section>

        {/* Closed shifts (date-filtered) */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h2 style={h2}>🔒 Closed shifts</h2>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInput} />
              <span>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInput} />
            </div>
          </div>
          {!loading && closed.length === 0 && (
            <div style={empty}>No closed shifts in this window.</div>
          )}
          {closed.length > 0 && (
            <div>
              {closed.map(s => <SessionCard key={s.session_id} row={s} profile={profiles[s.cashier_user_id]} onOpen={() => openDrill(s)} />)}
            </div>
          )}
        </section>
      </main>

      {/* Drill-down modal */}
      {drill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={() => setDrill(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: 760, width: '100%', marginTop: 32, border: '1px solid rgba(245,197,24,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ fontFamily: "'Playfair Display', serif", color: '#f5c518', margin: 0 }}>
                {profiles[drill.session.cashier_user_id]?.full_name ?? 'Cashier'} · {drill.session.location}
              </h3>
              <button onClick={() => setDrill(null)} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={statGrid}>
              <Stat label="Float"   value={dollars(drill.session.opening_float_cents)} accent="#fbbf24" />
              <Stat label="Cash"    value={dollars(drill.session.cash_sales_cents)}    accent="#4ade80" />
              <Stat label="Card"    value={dollars(drill.session.card_sales_cents)}    accent="#60a5fa" />
              <Stat label="Wire"    value={dollars(drill.session.wire_sales_cents)}    accent="#a78bfa" />
              <Stat label="Account" value={dollars(drill.session.account_sales_cents)} accent="#fbbf24" />
              <Stat label="Total"   value={dollars(drill.session.total_sales_cents)}   accent="#f5c518" />
            </div>
            {drill.session.status === 'closed' && (
              <div style={{ background: '#0f1f3d', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>
                <Row k="Counted cash" v={dollars(drill.session.closing_cash_counted_cents)} />
                <Row k="Expected (float + cash sales)" v={dollars(drill.session.opening_float_cents + drill.session.cash_sales_cents)} />
                <Row k="Variance"
                     v={(drill.session.variance_cents ?? 0) === 0 ? '✓ Even' :
                        (drill.session.variance_cents ?? 0) > 0  ? `+${dollars(drill.session.variance_cents)} over` :
                        `${dollars(drill.session.variance_cents)} short`} />
              </div>
            )}
            <h4 style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Orders ({drill.orders.length})</h4>
            {drillLoading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
            {!drillLoading && drill.orders.length === 0 && <p style={{ color: 'rgba(255,255,255,0.5)' }}>No orders on this shift yet.</p>}
            {drill.orders.map(o => (
              <Link key={o.id} href={`/receipt/${o.id}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', textDecoration: 'none', fontSize: 12, color: '#fff' }}>
                <span>
                  {new Date(o.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {' · '}
                  {paymentEmoji(o.payment_method)} {o.payment_method ?? '—'}
                  {o.customer_name && ` · ${o.customer_name}`}
                </span>
                <span style={{ color: '#f5c518', fontWeight: 700 }}>${Number(o.total).toFixed(2)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ row, profile, onOpen }: { row: SessionTotalsRow; profile: ProfileMini | undefined; onOpen: () => void }) {
  const expected   = row.opening_float_cents + row.cash_sales_cents;
  const variance   = row.variance_cents;
  const isOpen     = row.status === 'open';
  return (
    <button onClick={onOpen} style={{
      width: '100%', textAlign: 'left',
      background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginBottom: 8,
      cursor: 'pointer', color: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{profile?.full_name ?? '(unknown cashier)'}</span>
          <span style={{ marginLeft: 8, fontSize: 10, color: '#94a3b8' }}>· {row.location}</span>
          <span style={{ marginLeft: 8, fontSize: 10, color: '#94a3b8' }}>· {row.order_count} orders</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
          background: isOpen ? 'rgba(34,197,94,0.2)' : 'rgba(107,114,128,0.2)',
          color:      isOpen ? '#4ade80' : '#cbd5e1',
          textTransform: 'uppercase',
        }}>
          {isOpen ? '🟢 Open' : '🔒 Closed'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, fontSize: 11 }}>
        <Stat label="Float"   value={dollars(row.opening_float_cents)} accent="#fbbf24" small />
        <Stat label="Cash"    value={dollars(row.cash_sales_cents)}    accent="#4ade80" small />
        <Stat label="Card"    value={dollars(row.card_sales_cents)}    accent="#60a5fa" small />
        <Stat label="Wire"    value={dollars(row.wire_sales_cents)}    accent="#a78bfa" small />
        <Stat label="Account" value={dollars(row.account_sales_cents)} accent="#fbbf24" small />
        <Stat label="Total"   value={dollars(row.total_sales_cents)}   accent="#f5c518" small />
      </div>
      {!isOpen && variance !== null && (
        <div style={{ marginTop: 6, fontSize: 11, color: variance === 0 ? '#4ade80' : variance > 0 ? '#fbbf24' : '#f87171' }}>
          {variance === 0 ? '✓ Drawer balanced exactly' : variance > 0 ? `+${dollars(variance)} OVER expected (${dollars(expected)})` : `${dollars(variance)} SHORT vs expected (${dollars(expected)})`}
        </div>
      )}
    </button>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: small ? '6px 8px' : '10px 12px' }}>
      <div style={{ fontSize: small ? 8 : 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : 17, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{k}</span>
      <span style={{ color: '#fff' }}>{v}</span>
    </div>
  );
}

function paymentEmoji(pm: string | null): string {
  switch (pm) {
    case 'cash':    return '💵';
    case 'card':    return '💳';
    case 'wire':    return '🏦';
    case 'account': return '🧾';
    default:        return '·';
  }
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' };
const empty: React.CSSProperties = { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 };
const dateInput: React.CSSProperties = { background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '4px 8px', fontSize: 12 };
