'use client';

// /dashboard/health — operational health dashboard.
//
// Fires POST /api/health-check on load and on refresh. Renders the
// HealthReport returned by lib/health-check.ts: categorized findings
// with severity pills, sample IDs, and a one-line summary. Also exposes
// an "Email digest now" button that hits the same endpoint with
// ?send_email=true to push the branded HTML email to the variance
// alert recipient list.
//
// Coverage: same 23 scans the Founder AI's health_check tool runs, so
// founder gets a UI alternative to the chat-driven check.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

type Severity = 'info' | 'warning' | 'critical';
type Category = 'schema' | 'margin' | 'operational';
interface Finding {
  category:    Category;
  severity:    Severity;
  message:     string;
  count?:      number;
  sample_ids?: string[];
}
interface Report {
  generated_at: string;
  total:        number;
  by_severity:  { critical: number; warning: number; info: number };
  findings:     Finding[];
  summary:      string;
}

export default function HealthDashboard() {
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [report,  setReport]  = useState<Report | null>(null);
  const [err,     setErr]     = useState<string | null>(null);
  const [mailBusy,  setMailBusy]  = useState(false);
  const [mailToast, setMailToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/health-check', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: '{}',
    });
    const json = await res.json();
    setLoading(false);
    if (json.ok) setReport(json.report as Report);
    else setErr(json.error ?? 'unknown error');
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/health'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, []);

  useEffect(() => { if (authed) refresh(); }, [authed, refresh]);

  async function sendDigest() {
    setMailBusy(true); setMailToast(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/health-check?send_email=true', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: '{}',
    });
    const json = await res.json();
    setMailBusy(false);
    if (json.ok && json.email?.attempted > 0) {
      setMailToast({ ok: true, msg: `✓ Sent to ${json.email.sent}/${json.email.attempted} recipient(s)` });
    } else if (json.ok) {
      setMailToast({ ok: true, msg: `ℹ ${json.email?.reason ?? 'no recipients configured'}` });
    } else {
      setMailToast({ ok: false, msg: `⚠ ${json.error ?? 'unknown error'}` });
    }
    setTimeout(() => setMailToast(null), 6000);
  }

  const grouped = useMemo(() => {
    const g: Record<Category, Finding[]> = { schema: [], margin: [], operational: [] };
    for (const f of report?.findings ?? []) g[f.category].push(f);
    const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    for (const k of Object.keys(g) as Category[]) {
      g[k].sort((a, b) => order[a.severity] - order[b.severity]);
    }
    return g;
  }, [report]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  const critCount = report?.by_severity.critical ?? 0;

  return (
    <div style={pg}>
      <header style={{ ...hdr, borderBottomColor: critCount > 0 ? '#f87171' : 'rgba(245,197,24,0.2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={back}>← Dashboard</Link>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={refresh} disabled={loading}
                style={btnGold(loading)} title="Re-run all 23 scans">
                {loading ? 'Scanning…' : '🔁 Re-scan'}
              </button>
              <button onClick={sendDigest} disabled={mailBusy}
                style={btnGreen(mailBusy)} title="Email this report to the variance alert list right now">
                {mailBusy ? 'Sending…' : '📧 Email digest now'}
              </button>
            </div>
          </div>
          <h1 style={h1}>🩺 Operational health</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {report
              ? `${report.summary} · scanned ${new Date(report.generated_at).toLocaleString()}`
              : 'Running scans…'}
          </p>
          {mailToast && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: mailToast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color:      mailToast.ok ? '#4ade80' : '#f87171',
              border:    `1px solid ${mailToast.ok ? '#16a34a' : '#f87171'}` }}>
              {mailToast.msg}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
        {err && (
          <div style={{ padding: 14, background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, marginBottom: 16 }}>
            ⚠ {err}
          </div>
        )}

        {report && (
          <div style={statGrid}>
            <Stat label="Total findings"  value={report.total.toString()}                accent="#f5c518" />
            <Stat label="Critical"        value={report.by_severity.critical.toString()} accent={report.by_severity.critical > 0 ? '#f87171' : 'rgba(255,255,255,0.4)'} />
            <Stat label="Warning"         value={report.by_severity.warning.toString()}  accent={report.by_severity.warning  > 0 ? '#fb923c' : 'rgba(255,255,255,0.4)'} />
            <Stat label="Info"            value={report.by_severity.info.toString()}     accent={report.by_severity.info     > 0 ? '#60a5fa' : 'rgba(255,255,255,0.4)'} />
          </div>
        )}

        {report && report.findings.length === 0 && (
          <div style={{ marginTop: 24, padding: 32, textAlign: 'center', background: 'rgba(74,222,128,0.08)', border: '1px solid #16a34a', borderRadius: 12 }}>
            <div style={{ fontSize: 36 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#4ade80', marginTop: 8 }}>All clear</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>23 scans passed — no anomalies detected.</div>
          </div>
        )}

        {report && report.findings.length > 0 && (['operational','schema','margin'] as Category[]).map(cat => grouped[cat].length > 0 && (
          <section key={cat} style={{ marginTop: 24 }}>
            <h2 style={catHeader}>{cat} ({grouped[cat].length})</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {grouped[cat].map((f, i) => (
                <div key={i} style={{ ...findingCard, borderLeftColor: pillBorder(f.severity) }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <SeverityPill s={f.severity} />
                    {typeof f.count === 'number' && f.count > 0 && (
                      <span style={countBadge}>{f.count}</span>
                    )}
                  </div>
                  <p style={findingMsg}>{f.message}</p>
                  {f.sample_ids && f.sample_ids.length > 0 && (
                    <div style={sampleIds}>Sample IDs: {f.sample_ids.map(id => id.slice(0, 8)).join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 24, lineHeight: 1.5 }}>
          23 scans across schema / margin / operational. Critical = money or data risk · Warning = action soon · Info = FYI.<br/>
          Daily cron runs at 6am AST and only emails when ≥1 critical finding exists. Manual "Email digest now" always sends regardless of severity.
        </p>
      </main>
    </div>
  );
}

function SeverityPill({ s }: { s: Severity }) {
  const bg = s === 'critical' ? 'rgba(248,113,113,0.18)' : s === 'warning' ? 'rgba(251,146,60,0.18)' : 'rgba(96,165,250,0.18)';
  const fg = s === 'critical' ? '#f87171' : s === 'warning' ? '#fb923c' : '#60a5fa';
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${fg}`, borderRadius: 12, padding: '3px 10px', fontSize: 10, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {s}
    </span>
  );
}
function pillBorder(s: Severity): string {
  return s === 'critical' ? '#f87171' : s === 'warning' ? '#fb923c' : '#60a5fa';
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const btnGold = (disabled: boolean): React.CSSProperties => ({
  background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518',
  borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: disabled ? 0.5 : 1,
});
const btnGreen = (disabled: boolean): React.CSSProperties => ({
  background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid #16a34a',
  borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: disabled ? 0.5 : 1,
});
const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 8 };
const catHeader: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#f5c518', textTransform: 'capitalize', margin: '0 0 8px', borderBottom: '1px solid rgba(245,197,24,0.15)', paddingBottom: 4 };
const findingCard: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.1)', borderLeftWidth: 4, borderRadius: 8, padding: '12px 14px' };
const findingMsg:  React.CSSProperties = { fontSize: 13, color: '#fff', lineHeight: 1.6, margin: '8px 0 0' };
const sampleIds:   React.CSSProperties = { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 6, fontFamily: '"Courier New", monospace' };
const countBadge:  React.CSSProperties = { background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 800 };
