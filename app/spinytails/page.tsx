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
          <Link href="/dashboard" style={back}>← BSC Control</Link>
          <h1 style={h1}>🦞 Spiny Tails Processing Co.</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            HACCP + SSOP + traceability · {openLots.length} active lot{openLots.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
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
            <NavTile href="/lobster-intake"        icon="🦞" label="Lobster Intake (door)"  hint="Upstream / fisherman-facing" />
            <NavTile href="/dashboard/processing-batches" icon="🏭" label="Processing batches" hint="Bridge to existing traceability_batches" />
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
