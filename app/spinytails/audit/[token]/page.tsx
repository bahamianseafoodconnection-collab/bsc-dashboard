'use client';

// /spinytails/audit/[token] — Inspector landing page.
//
// No authentication required. Token-gated via SECURITY DEFINER RPCs.
// Calls spinytails_audit_session_open() to validate + log the visit,
// then spinytails_audit_view_lots() to list the lots in scope.
// Renders the BSC Market Place logo prominently so inspectors arriving
// on a phone immediately see they're on the right system.

import { useCallback, useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// Build our own browser client here — the audit viewer is the only
// route that's intentionally accessed without a user session. We don't
// want @/lib/supabase's default behavior interfering.
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SessionInfo {
  inspector_name:   string;
  inspector_agency: string;
  purpose:          string;
  granted_at:       string;
  expires_at:       string;
  scope_lot_count:  number;
  scope_date_from:  string | null;
  scope_date_to:    string | null;
}

interface LotRow {
  lot_code:       string;
  receipt_date:   string;
  status:         string;
  vessel_code:    string;
  fisherman_name: string;
  color_tag:      string;
  intake_lbs:     number;
  finished_lbs:   number;
  yield_pct:      number | null;
  shipped_at:     string | null;
}

export default function AuditLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [lots, setLots]       = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);

    // Try to open the session (also logs a 'session_open' view event)
    const { data: openData, error: openErr } = await supabase.rpc('spinytails_audit_session_open', { p_token: token });
    if (openErr) { setErr(openErr.message); setLoading(false); return; }
    const sessionRow = Array.isArray(openData) && openData.length > 0 ? openData[0] as SessionInfo : null;
    if (!sessionRow) {
      setErr('This audit link is invalid, revoked, or expired. Please request a new link from BSC.');
      setLoading(false); return;
    }
    setSession(sessionRow);

    const { data: lotData, error: lotErr } = await supabase.rpc('spinytails_audit_view_lots', { p_token: token });
    if (lotErr) { setErr(lotErr.message); setLoading(false); return; }
    setLots((lotData ?? []) as LotRow[]);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Shell><p style={{ color: '#94a3b8' }}>Validating audit link…</p></Shell>;
  if (err || !session) {
    return (
      <Shell>
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 16, borderRadius: 10, fontSize: 14 }}>
          ⚠ {err ?? 'No session'}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>
          Need help? Contact <strong>Bahamian Seafood Connection</strong>: 242-822-6180 · admin@bscbahamas.com
        </p>
      </Shell>
    );
  }

  const minutesLeft = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 60_000));

  return (
    <Shell>
      {/* Session banner */}
      <div style={{ background: '#fbfaf6', borderRadius: 12, padding: 18, marginBottom: 18, color: '#1a2e5a' }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: '#7a5e00', textTransform: 'uppercase', margin: 0 }}>
          🔐 Read-only inspection access
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#1a2e5a', margin: '6px 0 4px' }}>
          Welcome, {session.inspector_name}
        </h1>
        <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>
          <strong>{session.inspector_agency}</strong> · {session.purpose}
        </p>
        <p style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>
          Session expires <strong>{new Date(session.expires_at).toLocaleString()}</strong>
          {minutesLeft < 1440 && <span style={{ marginLeft: 8, color: minutesLeft < 60 ? '#9b1c1c' : '#7a5e00', fontWeight: 700 }}>
            ({minutesLeft >= 60 ? `${Math.round(minutesLeft / 60)} hours` : `${minutesLeft} minutes`} remaining)
          </span>}
        </p>
        <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          Scope:{' '}
          {session.scope_lot_count > 0
            ? `${session.scope_lot_count} specific lot${session.scope_lot_count === 1 ? '' : 's'}`
            : session.scope_date_from || session.scope_date_to
              ? `${session.scope_date_from ?? '…'} → ${session.scope_date_to ?? '…'}`
              : 'All lots'}
        </p>
      </div>

      {/* Quick nav */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
        <NavTile icon="🦞" label="Lots" hint={`${lots.length} in scope`} />
        <Link href={`/spinytails/audit/${encodeURIComponent(token)}/documents`}
          style={{ background: '#fff', borderRadius: 12, padding: 14, textDecoration: 'none', color: '#1a2e5a', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 22 }}>📚</div>
          <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>SOP · SSOP · HACCP library</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Procedure docs + records overview</div>
        </Link>
      </div>

      {/* Lots table */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 0, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#1a2e5a', fontSize: 18, margin: 0 }}>🦞 Lots in scope</h2>
          <p style={{ fontSize: 11, color: '#475569', margin: '4px 0 0' }}>Click any lot for the full chain — vessel intake, QC, temperature, processing, packaging, shipment.</p>
        </div>

        {lots.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No lots match this session&rsquo;s scope.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={th}>Lot code</th>
                <th style={th}>Date</th>
                <th style={th}>Vessel</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Intake lbs</th>
                <th style={{ ...th, textAlign: 'right' }}>Finished lbs</th>
                <th style={{ ...th, textAlign: 'right' }}>Yield</th>
              </tr>
            </thead>
            <tbody>
              {lots.map(l => (
                <tr key={l.lot_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={td}>
                    <Link href={`/spinytails/audit/${encodeURIComponent(token)}/lots/${encodeURIComponent(l.lot_code)}`}
                      style={{ color: '#1a2e5a', fontFamily: 'monospace', fontWeight: 800, textDecoration: 'none' }}>
                      {l.lot_code} →
                    </Link>
                  </td>
                  <td style={td}>{l.receipt_date}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{l.vessel_code} · {l.fisherman_name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{l.color_tag}</div>
                  </td>
                  <td style={td}><StatusPill status={l.status} /></td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{Number(l.intake_lbs).toFixed(1)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{Number(l.finished_lbs).toFixed(1)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: l.yield_pct != null ? '#1a2e5a' : '#cbd5e1' }}>
                    {l.yield_pct != null ? `${Number(l.yield_pct).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 18 }}>
        Audit access granted by Bahamian Seafood Connection. Every view is logged for compliance.
      </p>
    </Shell>
  );
}

export function StatusPill({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    received:             ['#fef3c7', '#92400e'],
    in_receiving_freezer: ['#dbeafe', '#1e40af'],
    thawing:              ['#fef3c7', '#92400e'],
    processing:           ['#ede9fe', '#5b21b6'],
    blast_freezing:       ['#dbeafe', '#1e40af'],
    mastered:             ['#dcfce7', '#166534'],
    in_distribution:      ['#dcfce7', '#166534'],
    shipped:              ['#bbf7d0', '#14532d'],
    rejected:             ['#fee2e2', '#991b1b'],
    recalled:             ['#fee2e2', '#991b1b'],
  };
  const [bg, fg] = colors[status] ?? ['#e5e7eb', '#374151'];
  return <span style={{ background: bg, color: fg, padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{status.replace(/_/g, ' ')}</span>;
}

function NavTile({ icon, label, hint }: { icon: string; label: string; hint: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 14, color: '#1a2e5a', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{hint}</div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#1a2e5a' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '14px 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style={{ height: 56, width: 'auto', display: 'block' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: '#a16207', textTransform: 'uppercase' }}>
                Spiny Tails Processing Co.
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>HACCP · SSOP · Traceability</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            🔐 Inspector view
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {children}
      </main>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: '10px 12px', color: '#1a2e5a' };
