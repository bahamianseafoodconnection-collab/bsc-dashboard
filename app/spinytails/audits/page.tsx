'use client';

// /spinytails/audits — Admin console for inspector audit sessions.
//
// Create a time-bound, scope-limited, read-only access window for
// fisheries inspectors. Shareable URL + QR. Live view counter so BSC
// sees what the inspector has accessed. Revoke instantly.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);
const AGENCIES = ['BAHFSA','Customs','Marine Resources','Public Health','Other'] as const;
type Agency = typeof AGENCIES[number];

interface Session {
  id: string;
  token: string;
  inspector_name: string;
  inspector_agency: string;
  inspector_id_doc: string | null;
  purpose: string;
  scope_lot_ids: string[] | null;
  scope_date_from: string | null;
  scope_date_to:   string | null;
  granted_by: string | null;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  notes: string | null;
}

interface ViewLog { session_id: string; count: number; last_viewed: string; }

interface LotMini { id: string; lot_code: string; receipt_date: string; status: string; }

export default function AuditsPage() {
  const [authed, setAuthed]   = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [viewCounts, setViewCounts] = useState<Record<string, ViewLog>>({});
  const [recentLots, setRecentLots] = useState<LotMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [share, setShare] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/spinytails/audits'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
    })();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: ss }, { data: lots }] = await Promise.all([
      supabase.from('spinytails_audit_sessions').select('*').order('granted_at', { ascending: false }).limit(200),
      supabase.from('spinytails_lots').select('id, lot_code, receipt_date, status').order('receipt_date', { ascending: false }).limit(80),
    ]);
    setSessions((ss ?? []) as Session[]);
    setRecentLots((lots ?? []) as LotMini[]);

    // View-count rollup
    const ids = (ss ?? []).map(s => s.id);
    if (ids.length > 0) {
      const { data: views } = await supabase
        .from('spinytails_audit_views')
        .select('session_id, viewed_at')
        .in('session_id', ids);
      const map: Record<string, ViewLog> = {};
      for (const v of (views ?? []) as { session_id: string; viewed_at: string }[]) {
        const existing = map[v.session_id];
        if (!existing) {
          map[v.session_id] = { session_id: v.session_id, count: 1, last_viewed: v.viewed_at };
        } else {
          existing.count += 1;
          if (v.viewed_at > existing.last_viewed) existing.last_viewed = v.viewed_at;
        }
      }
      setViewCounts(map);
    }
    setLoading(false);
  }

  async function revoke(s: Session) {
    const reason = prompt(`Revoke audit session for ${s.inspector_name}? Reason:`);
    if (reason === null) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('spinytails_audit_sessions').update({
      revoked_at:     new Date().toISOString(),
      revoked_by:     user?.id ?? null,
      revoked_reason: reason.trim() || 'no reason given',
    }).eq('id', s.id);
    if (error) { alert(error.message); return; }
    await load();
  }

  const active = useMemo(() => sessions.filter(s => !s.revoked_at && new Date(s.expires_at) > new Date()), [sessions]);
  const history = useMemo(() => sessions.filter(s => s.revoked_at || new Date(s.expires_at) <= new Date()), [sessions]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/spinytails" style={back}>← Spiny Tails</Link>
          <h1 style={h1}>🔐 Inspector audit sessions</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Time-bound, scope-limited, read-only access for BAHFSA / Customs / Marine Resources / etc. Every view is logged.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
            {active.length} active · {history.length} historical
          </p>
          <button onClick={() => setCreateOpen(true)}
            style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            + New audit session
          </button>
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}

        {/* Active */}
        <h2 style={h2}>🟢 Active sessions</h2>
        {!loading && active.length === 0 && <div style={empty}>No active sessions.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {active.map(s => {
            const v = viewCounts[s.id];
            const minutesLeft = Math.max(0, Math.floor((new Date(s.expires_at).getTime() - Date.now()) / 60_000));
            const expSoon     = minutesLeft < 60;
            return (
              <div key={s.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(34,211,238,0.18)', color: '#22d3ee', textTransform: 'uppercase' }}>
                    {s.inspector_agency}
                  </span>
                  <span style={{ fontSize: 10, color: expSoon ? '#f87171' : '#94a3b8', fontWeight: 700 }}>
                    {minutesLeft >= 60 ? `${Math.round(minutesLeft / 60)}h left` : `${minutesLeft}m left`}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{s.inspector_name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{s.purpose}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  Scope: {s.scope_lot_ids?.length ? `${s.scope_lot_ids.length} specific lot${s.scope_lot_ids.length === 1 ? '' : 's'}` :
                          s.scope_date_from || s.scope_date_to ? `${s.scope_date_from ?? '…'} → ${s.scope_date_to ?? '…'}` : 'All lots'}
                </div>
                <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 6 }}>
                  👁 {v?.count ?? 0} view{(v?.count ?? 0) === 1 ? '' : 's'}
                  {v?.last_viewed && ` · last ${new Date(v.last_viewed).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}`}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => setShare(s)}
                    style={{ flex: 2, background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                    📎 Share link
                  </button>
                  <button onClick={() => revoke(s)}
                    style={{ flex: 1, background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid #f87171', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                    ✗ Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* History */}
        {history.length > 0 && (
          <>
            <h2 style={{ ...h2, marginTop: 24 }}>📚 Historical / revoked</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {history.slice(0, 24).map(s => {
                const v = viewCounts[s.id];
                return (
                  <div key={s.id} style={{ ...card, opacity: 0.65, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{s.inspector_name} · {s.inspector_agency}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {s.purpose} · {v?.count ?? 0} views
                    </div>
                    <div style={{ fontSize: 10, color: s.revoked_at ? '#f87171' : '#94a3b8', marginTop: 4 }}>
                      {s.revoked_at ? `Revoked ${new Date(s.revoked_at).toLocaleDateString()}: ${s.revoked_reason ?? '—'}` : `Expired ${new Date(s.expires_at).toLocaleDateString()}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {createOpen && (
        <CreateModal recentLots={recentLots} onClose={() => setCreateOpen(false)}
          onCreated={async (created) => { setCreateOpen(false); await load(); setShare(created); }} />
      )}
      {share && <ShareModal session={share} onClose={() => setShare(null)} />}
    </div>
  );
}

function CreateModal({ recentLots, onClose, onCreated }: { recentLots: LotMini[]; onClose: () => void; onCreated: (s: Session) => Promise<void> }) {
  const [name, setName]       = useState('');
  const [agency, setAgency]   = useState<Agency>('BAHFSA');
  const [idDoc, setIdDoc]     = useState('');
  const [purpose, setPurpose] = useState('Routine HACCP audit');
  const [durationHours, setDurationHours] = useState(24);
  const [scopeMode, setScopeMode] = useState<'all' | 'lots' | 'dates'>('all');
  const [pickedLotIds, setPickedLotIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [notes, setNotes]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  function toggleLot(id: string) {
    setPickedLotIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function submit() {
    setErr(null);
    if (!name.trim()) { setErr('Inspector name required'); return; }
    if (durationHours < 1) { setErr('Duration must be at least 1 hour'); return; }
    if (scopeMode === 'lots' && pickedLotIds.length === 0) { setErr('Pick at least one lot'); return; }
    if (scopeMode === 'dates' && !dateFrom && !dateTo) { setErr('Pick at least one date'); return; }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tok } = await supabase.rpc('spinytails_audit_generate_token');
      if (!tok) throw new Error('Token generation failed');
      const expires = new Date(Date.now() + durationHours * 3_600_000).toISOString();

      const { data: row, error: insErr } = await supabase.from('spinytails_audit_sessions').insert({
        token:            tok,
        inspector_name:   name.trim(),
        inspector_agency: agency,
        inspector_id_doc: idDoc.trim() || null,
        purpose:          purpose.trim(),
        scope_lot_ids:    scopeMode === 'lots'  ? pickedLotIds : null,
        scope_date_from:  scopeMode === 'dates' && dateFrom ? dateFrom : null,
        scope_date_to:    scopeMode === 'dates' && dateTo   ? dateTo   : null,
        granted_by:       user?.id ?? null,
        granted_at:       new Date().toISOString(),
        expires_at:       expires,
        notes:            notes.trim() || null,
      }).select('*').single();
      if (insErr) throw insErr;
      await onCreated(row as Session);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="+ New audit session" onClose={onClose} maxW={640}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Inspector name *"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alice Bethel" style={inp} /></Field>
        <Field label="Agency *">
          <select value={agency} onChange={(e) => setAgency(e.target.value as Agency)} style={inp}>
            {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Govt ID #"><input value={idDoc} onChange={(e) => setIdDoc(e.target.value)} placeholder="optional" style={inp} /></Field>
        <Field label="Valid for (hours) *">
          <select value={durationHours} onChange={(e) => setDurationHours(parseInt(e.target.value, 10))} style={inp}>
            <option value="2">2 hours (quick visit)</option>
            <option value="24">24 hours</option>
            <option value="72">72 hours (3 days)</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
          </select>
        </Field>
      </div>
      <Field label="Purpose *"><input value={purpose} onChange={(e) => setPurpose(e.target.value)} style={inp} /></Field>

      <div style={{ background: '#0a1628', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Scope</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['all','lots','dates'] as const).map(m => (
            <button key={m} onClick={() => setScopeMode(m)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                background: scopeMode === m ? '#f5c518' : 'rgba(255,255,255,0.05)',
                color:      scopeMode === m ? '#060d1f' : '#94a3b8', border: 'none',
              }}>
              {m === 'all' ? 'All lots' : m === 'lots' ? 'Specific lots' : 'Date range'}
            </button>
          ))}
        </div>

        {scopeMode === 'lots' && (
          <div style={{ maxHeight: 240, overflowY: 'auto', background: '#060d1f', borderRadius: 6, padding: 6 }}>
            {recentLots.map(l => (
              <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 11, cursor: 'pointer', color: '#cbd5e1' }}>
                <input type="checkbox" checked={pickedLotIds.includes(l.id)} onChange={() => toggleLot(l.id)} />
                <span style={{ fontFamily: 'monospace', color: '#f5c518', fontSize: 11 }}>{l.lot_code}</span>
                <span style={{ color: '#94a3b8' }}>· {l.receipt_date} · {l.status.replace(/_/g, ' ')}</span>
              </label>
            ))}
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, padding: '4px 6px' }}>{pickedLotIds.length} selected</div>
          </div>
        )}

        {scopeMode === 'dates' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="From date"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} /></Field>
            <Field label="To date"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} /></Field>
          </div>
        )}

        {scopeMode === 'all' && (
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Inspector sees every lot in the system for the duration. Use this for general HACCP audits.</p>
        )}
      </div>

      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional context" style={inp} /></Field>

      {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ flex: 2, background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 900, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Creating…' : '✓ Create + get share link'}
        </button>
      </div>
    </ModalShell>
  );
}

function ShareModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bscbahamas.com';
  const url    = `${origin}/spinytails/audit/${encodeURIComponent(session.token)}`;
  const qr     = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=2&data=${encodeURIComponent(url)}`;

  function copy(s: string) { try { navigator.clipboard.writeText(s); } catch {} }

  return (
    <ModalShell title="📎 Share audit link" onClose={onClose} maxW={520}>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '0 0 12px' }}>
        Send the URL by SMS / email / WhatsApp — or show the inspector the QR. No login required on their side.
      </p>

      <div style={{ background: '#0a1628', borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>For</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{session.inspector_name} · {session.inspector_agency}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{session.purpose}</div>
        <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>Expires {new Date(session.expires_at).toLocaleString()}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="audit-qr" style={{ width: 180, height: 180, borderRadius: 8, background: '#fff', padding: 6 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>URL</div>
          <div style={{ background: '#060d1f', padding: 8, borderRadius: 6, fontSize: 11, wordBreak: 'break-all', color: '#cbd5e1', marginBottom: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {url}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => copy(url)} style={{ flex: 1, background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>📋 Copy URL</button>
            <a href={qr} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid #a78bfa', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 800, textAlign: 'center', textDecoration: 'none' }}>🖼 Open QR</a>
          </div>
          <button onClick={() => copy(session.token)} style={{ width: '100%', marginTop: 6, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'ui-monospace, Menlo, monospace' }}>Copy token only</button>
        </div>
      </div>

      <button onClick={onClose} style={{ width: '100%', marginTop: 14, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Done</button>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose, maxW }: { title: string; children: React.ReactNode; onClose: () => void; maxW?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: maxW ?? 540, width: '100%', marginTop: 24, border: '1px solid rgba(245,197,24,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#f5c518', margin: 0, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '6px 0 2px' };
const h2: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' };
const empty: React.CSSProperties = { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: '#fff' };
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13, boxSizing: 'border-box' };
