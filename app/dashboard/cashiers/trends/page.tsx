'use client';

// /dashboard/cashiers/trends — per-cashier monthly aggregates.
//
// Reads cash_drawer_session_totals over a date range, groups by
// cashier, computes: # closed sessions, total sales, cash sales,
// card sales, account sales, total variance (sum), # short shifts
// (variance < -$5), # over shifts (variance > $20), average variance
// per shift. Useful for spotting chronic shorters, growth trends, or
// drift in a particular cashier's numbers.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);
const SHORT_THRESHOLD_CENTS = -500;
const OVER_THRESHOLD_CENTS  = 2000;

interface SessionTotalsRow {
  session_id:                  string;
  cashier_user_id:             string;
  location:                    string;
  status:                      'open' | 'closed';
  opened_at:                   string;
  closed_at:                   string | null;
  opening_float_cents:         number;
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

interface CashierTrend {
  cashier_user_id:    string;
  full_name:          string;
  role:               string;
  sessions:           number;
  total_sales_cents:  number;
  cash_sales_cents:   number;
  card_sales_cents:   number;
  account_sales_cents: number;
  total_variance_cents: number;
  avg_variance_cents: number;
  short_count:        number;
  over_count:         number;
  worst_short_cents:  number;   // most negative variance
  best_over_cents:    number;   // most positive variance
  locations:          string[];
}

function dollars(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

export default function CashierTrendsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows]     = useState<SessionTotalsRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [digestBusy,  setDigestBusy]  = useState(false);
  const [digestToast, setDigestToast] = useState<{ ok: boolean; msg: string } | null>(null);

  async function sendWeeklyDigest() {
    setDigestBusy(true); setDigestToast(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/cashiers/weekly-digest', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: '{}',
    });
    const json = await res.json();
    setDigestBusy(false);
    if (json.ok && json.alerted) {
      const s = json.stats ?? {};
      setDigestToast({ ok: true, msg: `✓ Digest sent — week ${json.week?.from} → ${json.week?.to}, ${s.cashiers} cashiers, ${s.short_shifts} short, ${s.over_shifts} over` });
    } else if (json.ok && !json.alerted) {
      setDigestToast({ ok: true, msg: `ℹ ${json.reason}` });
    } else {
      setDigestToast({ ok: false, msg: `⚠ ${json.error ?? 'unknown error'}` });
    }
    setTimeout(() => setDigestToast(null), 6000);
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/cashiers/trends'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, []);

  useEffect(() => { if (authed) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authed, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cash_drawer_session_totals')
      .select('*')
      .eq('status', 'closed')
      .gte('closed_at', `${dateFrom}T00:00:00`)
      .lte('closed_at', `${dateTo}T23:59:59`)
      .order('closed_at', { ascending: false });
    const list = (data ?? []) as SessionTotalsRow[];
    setRows(list);

    const uids = Array.from(new Set(list.map(r => r.cashier_user_id)));
    if (uids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role').in('id', uids);
      const pm: Record<string, ProfileMini> = {};
      for (const p of (profs ?? []) as ProfileMini[]) pm[p.id] = p;
      setProfiles(pm);
    } else { setProfiles({}); }
    setLoading(false);
  }

  const trends: CashierTrend[] = useMemo(() => {
    const map = new Map<string, CashierTrend>();
    for (const r of rows) {
      const prof = profiles[r.cashier_user_id];
      const variance = r.variance_cents ?? 0;
      const existing = map.get(r.cashier_user_id);
      const row: CashierTrend = existing ?? {
        cashier_user_id:      r.cashier_user_id,
        full_name:            prof?.full_name ?? '(unknown)',
        role:                 prof?.role ?? '—',
        sessions:             0,
        total_sales_cents:    0,
        cash_sales_cents:     0,
        card_sales_cents:     0,
        account_sales_cents:  0,
        total_variance_cents: 0,
        avg_variance_cents:   0,
        short_count:          0,
        over_count:           0,
        worst_short_cents:    0,
        best_over_cents:      0,
        locations:            [],
      };
      row.sessions             += 1;
      row.total_sales_cents    += r.total_sales_cents;
      row.cash_sales_cents     += r.cash_sales_cents;
      row.card_sales_cents     += r.card_sales_cents;
      row.account_sales_cents  += r.account_sales_cents;
      row.total_variance_cents += variance;
      if (variance < SHORT_THRESHOLD_CENTS) row.short_count += 1;
      if (variance > OVER_THRESHOLD_CENTS)  row.over_count  += 1;
      if (variance < row.worst_short_cents) row.worst_short_cents = variance;
      if (variance > row.best_over_cents)   row.best_over_cents   = variance;
      if (!row.locations.includes(r.location)) row.locations.push(r.location);
      map.set(r.cashier_user_id, row);
    }
    for (const t of map.values()) {
      t.avg_variance_cents = t.sessions > 0 ? Math.round(t.total_variance_cents / t.sessions) : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total_sales_cents - a.total_sales_cents);
  }, [rows, profiles]);

  const totals = useMemo(() => {
    return trends.reduce((acc, t) => {
      acc.sessions += t.sessions;
      acc.total    += t.total_sales_cents;
      acc.cash     += t.cash_sales_cents;
      acc.account  += t.account_sales_cents;
      acc.short    += t.short_count;
      acc.over     += t.over_count;
      acc.variance += t.total_variance_cents;
      return acc;
    }, { sessions: 0, total: 0, cash: 0, account: 0, short: 0, over: 0, variance: 0 });
  }, [trends]);

  function downloadCsv() {
    const headers = ['Cashier','Role','Locations','Sessions','Total sales','Cash','Card','Account','Sum variance','Avg variance','Short shifts','Over shifts','Worst short','Best over'];
    const lines = trends.map(t => [
      t.full_name, t.role, t.locations.join('+'), t.sessions,
      (t.total_sales_cents/100).toFixed(2), (t.cash_sales_cents/100).toFixed(2),
      (t.card_sales_cents/100).toFixed(2), (t.account_sales_cents/100).toFixed(2),
      (t.total_variance_cents/100).toFixed(2), (t.avg_variance_cents/100).toFixed(2),
      t.short_count, t.over_count,
      (t.worst_short_cents/100).toFixed(2), (t.best_over_cents/100).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `bsc-cashier-trends-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard/cashiers" style={back}>← Live cashier drawers</Link>
            <button onClick={sendWeeklyDigest} disabled={digestBusy}
              style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid #16a34a', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: digestBusy ? 0.5 : 1 }}
              title="Email last week's per-cashier digest (HTML table + CSV attachment). Also auto-runs Mondays 7am AST.">
              {digestBusy ? 'Sending…' : '📧 Email last week\'s digest'}
            </button>
          </div>
          <h1 style={h1}>📈 Cashier trends — by cashier</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Closed sessions only · {dateFrom} → {dateTo} · {trends.length} cashier{trends.length === 1 ? '' : 's'}
          </p>
          {digestToast && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: digestToast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color:      digestToast.ok ? '#4ade80' : '#f87171',
              border:    `1px solid ${digestToast.ok ? '#16a34a' : '#f87171'}` }}>
              {digestToast.msg}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>From <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInput} /></label>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>To <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInput} /></label>
          <button onClick={downloadCsv} disabled={trends.length === 0}
            style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            ⬇ CSV
          </button>
        </div>

        <div style={statGrid}>
          <Stat label="Sessions"    value={totals.sessions.toString()}   accent="#f5c518" />
          <Stat label="Total sales" value={dollars(totals.total)}        accent="#4ade80" />
          <Stat label="Cash sales"  value={dollars(totals.cash)}         accent="#60a5fa" />
          <Stat label="Account"     value={dollars(totals.account)}      accent="#fbbf24" />
          <Stat label="Short shifts" value={totals.short.toString()}     accent="#f87171" />
          <Stat label="Over shifts"  value={totals.over.toString()}      accent="#fb923c" />
          <Stat label="Net variance" value={dollars(totals.variance)}    accent={totals.variance < 0 ? '#f87171' : '#4ade80'} />
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>Loading…</p>}
        {!loading && trends.length === 0 && <div style={empty}>No closed shifts in this window.</div>}

        {trends.length > 0 && (
          <div style={{ marginTop: 16, overflow: 'auto', borderRadius: 12, border: '1px solid rgba(245,197,24,0.15)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 980 }}>
              <thead style={{ background: '#0b1628' }}>
                <tr>
                  <th style={th}>Cashier</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sessions</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total sales</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cash</th>
                  <th style={{ ...th, textAlign: 'right' }}>Card</th>
                  <th style={{ ...th, textAlign: 'right' }}>Account</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sum variance</th>
                  <th style={{ ...th, textAlign: 'right' }}>Avg / shift</th>
                  <th style={{ ...th, textAlign: 'right' }}>Short</th>
                  <th style={{ ...th, textAlign: 'right' }}>Over</th>
                  <th style={{ ...th, textAlign: 'right' }}>Worst</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t, i) => {
                  const sumColor = t.total_variance_cents < 0 ? '#f87171' : t.total_variance_cents > 0 ? '#fbbf24' : '#4ade80';
                  const avgColor = t.avg_variance_cents   < 0 ? '#f87171' : t.avg_variance_cents   > 0 ? '#fbbf24' : '#4ade80';
                  return (
                    <tr key={t.cashier_user_id} style={{ background: i % 2 === 0 ? '#060d1f' : '#0a1628' }}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, color: '#fff' }}>{t.full_name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{t.role} · {t.locations.join(' + ')}</div>
                      </td>
                      <td style={td}>{t.sessions}</td>
                      <td style={{ ...td, color: '#f5c518', fontWeight: 700 }}>{dollars(t.total_sales_cents)}</td>
                      <td style={td}>{dollars(t.cash_sales_cents)}</td>
                      <td style={td}>{dollars(t.card_sales_cents)}</td>
                      <td style={td}>{dollars(t.account_sales_cents)}</td>
                      <td style={{ ...td, color: sumColor, fontWeight: 700 }}>{dollars(t.total_variance_cents)}</td>
                      <td style={{ ...td, color: avgColor }}>{dollars(t.avg_variance_cents)}</td>
                      <td style={{ ...td, color: t.short_count > 0 ? '#f87171' : 'rgba(255,255,255,0.3)', fontWeight: t.short_count > 0 ? 700 : 400 }}>{t.short_count}</td>
                      <td style={{ ...td, color: t.over_count  > 0 ? '#fb923c' : 'rgba(255,255,255,0.3)' }}>{t.over_count}</td>
                      <td style={{ ...td, color: '#f87171', fontSize: 11 }}>{t.worst_short_cents < 0 ? dollars(t.worst_short_cents) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12, lineHeight: 1.5 }}>
          Short = variance &lt; −$5 · Over = variance &gt; +$20 · Same thresholds the variance-alert email uses. Sorted by total sales descending.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const empty: React.CSSProperties = { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12, marginTop: 16 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 };
const dateInput: React.CSSProperties = { background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '4px 8px', fontSize: 12, marginLeft: 6 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 10px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(245,197,24,0.15)' };
const td: React.CSSProperties = { padding: '10px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', textAlign: 'right', color: '#fff' };
