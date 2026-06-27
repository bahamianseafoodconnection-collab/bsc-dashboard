'use client';

// /spinytails — hub for Spiny Tails Processing Co. HACCP + traceability.
//
// Live stats across the spinytails_* tables, plus nav to sub-sections
// and a bridge back to /lobster-intake (where Step 1 originates).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface LotRow {
  id:             string;
  lot_code:       string;
  receipt_date:   string;
  status:         string;
  vessel_id:      string;
}
interface VesselRow {
  id:           string;
  vessel_code:  string;
  fisherman_name: string;
  color_tag:    string;
  status:       string;
}

export default function SpinytailsHubPage() {
  const [authed, setAuthed]     = useState<boolean | null>(null);
  const [openLots, setOpenLots] = useState<LotRow[]>([]);
  const [vessels, setVessels]   = useState<VesselRow[]>([]);
  const [todayIntakeLbs, setTodayIntakeLbs] = useState(0);
  const [tempExcursions, setTempExcursions] = useState(0);
  const [openCapas, setOpenCapas]           = useState(0);
  const [pendingQc, setPendingQc]           = useState(0);
  const [loading, setLoading]   = useState(true);
  const [ssopBusy, setSsopBusy] = useState(false);
  const [ssopToast, setSsopToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [batchQuery, setBatchQuery] = useState('');
  function openBatchPull() {
    const b = batchQuery.trim();
    if (b) window.location.href = `/spinytails/batch/${encodeURIComponent(b)}`;
  }

  async function sendSsopDigest() {
    setSsopBusy(true); setSsopToast(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/spinytails/ssop-reminder', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: '{}',
    });
    const json = await res.json();
    setSsopBusy(false);
    if (json.ok && json.alerted) {
      const s = json.stats ?? {};
      setSsopToast({ ok: true, msg: `✓ SSOP digest sent — ${s.missing} missing · ${s.unresolved} unresolved · ${s.calib_due} calib · ${s.training_expiring} training` });
    } else if (json.ok && !json.alerted) {
      setSsopToast({ ok: true, msg: `ℹ ${json.reason}` });
    } else {
      setSsopToast({ ok: false, msg: `⚠ ${json.error ?? 'unknown error'}` });
    }
    setTimeout(() => setSsopToast(null), 6000);
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/spinytails'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
    })();
  }, []);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: lots }, { data: vs }, { data: intakes }, { data: temps }, { data: capas }, { data: qcs }] = await Promise.all([
      supabase.from('spinytails_lots').select('id, lot_code, receipt_date, status, vessel_id')
        .not('status', 'in', '(shipped,rejected,recalled)').order('receipt_date', { ascending: false }).limit(50),
      supabase.from('spinytails_vessels').select('id, vessel_code, fisherman_name, color_tag, status').order('vessel_code'),
      supabase.from('spinytails_lot_intakes').select('quantity_lbs').gte('intake_time', `${today}T00:00:00`),
      supabase.from('spinytails_temperature_logs').select('id').eq('within_limit', false).gte('logged_at', `${today}T00:00:00`),
      supabase.from('spinytails_corrective_actions').select('id').is('closed_at', null),
      supabase.from('spinytails_quality_inspections').select('id').eq('result', 'pending'),
    ]);
    setOpenLots((lots ?? []) as LotRow[]);
    setVessels((vs ?? []) as VesselRow[]);
    setTodayIntakeLbs((intakes ?? []).reduce((s: number, r: { quantity_lbs: number }) => s + Number(r.quantity_lbs), 0));
    setTempExcursions((temps ?? []).length);
    setOpenCapas((capas ?? []).length);
    setPendingQc((qcs ?? []).length);
    setLoading(false);
  }

  const lotsByStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of openLots) m.set(l.status, (m.get(l.status) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [openLots]);

  const vesselsById = useMemo(() => {
    const m = new Map<string, VesselRow>();
    for (const v of vessels) m.set(v.id, v);
    return m;
  }, [vessels]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={back}>← BSC Control</Link>
            <button onClick={sendSsopDigest} disabled={ssopBusy}
              style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: ssopBusy ? 0.5 : 1 }}
              title="Email today's SSOP compliance digest to admins now (also auto-runs daily at 11am AST)">
              {ssopBusy ? 'Sending…' : '🔔 Send SSOP digest now'}
            </button>
          </div>
          <h1 style={h1}>🦞 Spiny Tails Processing Co.</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            HACCP + SSOP + traceability · {openLots.length} active lot{openLots.length === 1 ? '' : 's'}
          </p>
          {ssopToast && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: ssopToast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color:      ssopToast.ok ? '#4ade80' : '#f87171',
              border:    `1px solid ${ssopToast.ok ? '#16a34a' : '#f87171'}` }}>
              {ssopToast.msg}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {/* ── PROCESSING RECORDS PER BATCH PULL — one batch = one audit file ── */}
        <div style={{ background: 'linear-gradient(135deg, rgba(245,197,24,0.12), rgba(245,197,24,0.03))', border: '1px solid rgba(245,197,24,0.35)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ color: '#f5c518', fontWeight: 900, fontSize: 14 }}>📑 Processing Records Per Batch Pull</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5, margin: '2px 0 10px' }}>Scan or type a batch number — opens the complete audit file (receiving → export).</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={batchQuery} onChange={e => setBatchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') openBatchPull(); }}
              placeholder="e.g. CON-20260624-01-01"
              style={{ flex: 1, background: 'rgba(0,0,0,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace' }} />
            <button onClick={openBatchPull} disabled={!batchQuery.trim()}
              style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 9, padding: '10px 16px', fontWeight: 900, fontSize: 13, cursor: batchQuery.trim() ? 'pointer' : 'not-allowed', opacity: batchQuery.trim() ? 1 : 0.5 }}>Pull →</button>
          </div>
        </div>

        {/* ── Processor handbook: today's tasks (guided checklist) ── */}
        {(() => {
          const lc = (s: string) => openLots.filter(l => l.status === s).length;
          const tasks: { icon: string; label: string; href: string; count: number | null; cta: string; danger?: boolean }[] = [
            { icon: '📥', label: 'Receive incoming product — weigh, temp (CCP-1), generate lot', href: '/spinytails/receiving', count: null, cta: 'Receive' },
            { icon: '📦', label: 'Lots received, awaiting processing',        href: '/spinytails/processing', count: lc('received'), cta: 'Start' },
            { icon: '🧊', label: 'Lots in processing / blast freezing',       href: '/spinytails/processing', count: lc('processing') + lc('blast_freezing'), cta: 'Open' },
            { icon: '🌡️', label: 'Temperature excursions to correct (today)', href: '/spinytails/processing', count: tempExcursions, cta: 'Correct', danger: true },
            { icon: '✅', label: 'Quality inspections pending',               href: '/spinytails/processing', count: pendingQc, cta: 'Inspect' },
            { icon: '🔧', label: 'Open corrective actions (CAPA)',            href: '/spinytails/processing', count: openCapas, cta: 'Resolve', danger: true },
            { icon: '🏷️', label: 'Lots approved — pack, label & prep export', href: '/spinytails/labels', count: lc('approved'), cta: 'Pack' },
            { icon: '📜', label: 'HACCP · SOP · SSOP document library',        href: '/spinytails/documents', count: null, cta: 'Open' },
          ];
          const openCount = tasks.reduce((s, t) => s + (t.count ?? 0), 0);
          return (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>✅ Today&apos;s tasks</div>
                <div style={{ color: openCount > 0 ? '#f5c518' : '#4ade80', fontWeight: 900, fontSize: 12 }}>
                  {loading ? '…' : openCount > 0 ? `${openCount} open` : 'All clear 🎉'}
                </div>
              </div>
              {tasks.map((t) => {
                const done = t.count === 0;
                const badgeColor = t.count == null ? 'rgba(255,255,255,0.5)' : done ? '#4ade80' : t.danger ? '#f87171' : '#f5c518';
                const badgeBg = t.count == null ? 'rgba(255,255,255,0.06)' : done ? 'rgba(74,222,128,0.15)' : t.danger ? 'rgba(248,113,113,0.15)' : 'rgba(245,197,24,0.15)';
                return (
                  <Link key={t.label} href={t.href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}>
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{t.icon}</span>
                    <span style={{ width: 30, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: badgeColor, background: badgeBg, border: `1px solid ${badgeColor}55` }}>
                      {loading ? '·' : t.count == null ? '•' : done ? '✓' : t.count}
                    </span>
                    <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12.5, fontWeight: 600 }}>{t.label}</span>
                    <span style={{ color: '#f5c518', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{t.cta} →</span>
                  </Link>
                );
              })}
            </div>
          );
        })()}

        <div style={statGrid}>
          <Stat label="Today's intake" value={`${todayIntakeLbs.toFixed(1)} lbs`} accent="#f5c518" />
          <Stat label="Active lots"    value={openLots.length.toString()}        accent="#4ade80" />
          <Stat label="Vessels"        value={`${vessels.filter(v => v.status === 'approved').length} active`} accent="#60a5fa" />
          <Stat label="Pending QC"     value={pendingQc.toString()}              accent={pendingQc > 0 ? '#fbbf24' : 'rgba(255,255,255,0.5)'} />
          <Stat label="Temp excursions (today)" value={tempExcursions.toString()} accent={tempExcursions > 0 ? '#f87171' : '#4ade80'} />
          <Stat label="Open CAPAs"     value={openCapas.toString()}              accent={openCapas > 0 ? '#f87171' : '#4ade80'} />
        </div>

        {/* Quick actions */}
        <div style={{ marginTop: 16 }}>
          <h2 style={h2}>Quick actions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <NavTile href="/spinytails/intake"    icon="📥" label="New intake (Step 1-2)"  hint="Receive lobster, generate lot code, run CCP-1" />
            <NavTile href="/spinytails/vessels"   icon="🛥"  label="Vessels"                hint="Registry + color tags" />
            <NavTile href="/spinytails/steps"     icon="📚" label="Step-by-step SOPs"      hint="Walkthrough of all 11 steps + CCPs" />
            <NavTile href="/spinytails/documents" icon="📜" label="Document library"       hint="SOP · SSOP · HACCP · upload + versioning" />
            <NavTile href="/spinytails/audits"    icon="🔐" label="Inspector audit access" hint="Token + QR for BAHFSA / Customs / Marine Resources" />
            <NavTile href="/lobster-intake"        icon="🦞" label="Lobster Intake (door)"  hint="Upstream / fisherman-facing" />
            <NavTile href="/dashboard/processing-batches" icon="🏭" label="Processing batches" hint="Bridge to existing traceability_batches" />
            <NavTile href="/spinytails/phone-orders" icon="📞" label="Phone order pick tickets" hint="Approved phone orders to assemble + pack" />
          </div>
        </div>

        {/* Active lots */}
        <div style={{ marginTop: 24 }}>
          <h2 style={h2}>Active lots</h2>
          {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
          {!loading && openLots.length === 0 && <div style={empty}>No active lots — start one at /spinytails/intake.</div>}

          {lotsByStatus.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {lotsByStatus.map(([s, n]) => (
                <span key={s} style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(245,197,24,0.15)', color: '#f5c518', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {s.replace(/_/g, ' ')} · {n}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {openLots.slice(0, 12).map(l => {
              const v = vesselsById.get(l.vessel_id);
              return (
                <Link key={l.id} href={`/spinytails/lots/${encodeURIComponent(l.lot_code)}`}
                  style={{
                    background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                    padding: 10, textDecoration: 'none', color: '#fff',
                  }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c518', fontWeight: 800 }}>{l.lot_code}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {v ? `${v.vessel_code} · ${v.fisherman_name}` : '—'} · {l.receipt_date}
                  </div>
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                    background: 'rgba(96,165,250,0.18)', color: '#60a5fa', textTransform: 'uppercase' }}>
                    {l.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavTile({ href, icon, label, hint }: { href: string; icon: string; label: string; hint: string }) {
  return (
    <Link href={href} style={{
      background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 12,
      padding: 12, textDecoration: 'none', color: '#fff',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#f5c518' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{hint}</div>
    </Link>
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
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const h2: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' };
const empty: React.CSSProperties = { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const statGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 };
