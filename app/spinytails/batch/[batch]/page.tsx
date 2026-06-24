'use client';

// /spinytails/batch/[batch] — PROCESSING RECORDS PER BATCH PULL.
// One batch number = one complete digital audit file (receiving → export),
// assembled read-only from /api/spinytails/batch-pull/[batch].

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.1)';

type Rec = Record<string, unknown>;
type Resp = {
  ok: boolean; batch_number: string; lot: Rec; vessel: Rec | null; species: Rec | null;
  sections: Record<string, Rec[]>;
  summary: { received_lbs: number; yield_pct: number | null; temp_readings: number; qc_inspections: number; open_capas: number; status: string | null };
  alerts: { missing: string[]; nonconformance: string[] };
};

const SECTION_META: { key: string; title: string; icon: string }[] = [
  { key: 'receiving', title: 'Receiving (HACCP CCP-1)', icon: '📥' },
  { key: 'temperature', title: 'Temperature monitoring', icon: '🌡️' },
  { key: 'quality', title: 'Quality / HACCP inspection', icon: '✅' },
  { key: 'processing', title: 'Processing', icon: '🏭' },
  { key: 'processing_steps', title: 'Processing steps', icon: '📋' },
  { key: 'grades', title: 'Grading', icon: '🏷️' },
  { key: 'freezer_removals', title: 'Blast freezer / storage', icon: '🧊' },
  { key: 'packing', title: 'Packing', icon: '📦' },
  { key: 'sanitation', title: 'Sanitation (SSOP)', icon: '🧼' },
  { key: 'corrective_actions', title: 'Corrective actions (CAPA)', icon: '🔧' },
  { key: 'export', title: 'Export', icon: '🚢' },
];

const SKIP = new Set(['id', 'lot_id', 'batch_id', 'created_at', 'updated_at', 'shipment_id']);
function titleize(k: string) { return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function fmt(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '✓ yes' : '✗ no';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? `${v.length} item(s)` : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 16).replace('T', ' ');
  return s;
}

export default function BatchPullPage() {
  const params = useParams();
  const router = useRouter();
  const batch = decodeURIComponent(String(params.batch || ''));
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { router.push(`/staff-login?next=/spinytails/batch/${encodeURIComponent(batch)}`); return; }
      const res = await fetch(`/api/spinytails/batch-pull/${encodeURIComponent(batch)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setD(j as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [supabase, router, batch]);
  useEffect(() => { load(); }, [load]);

  const lot = d?.lot ?? {};
  const vessel = d?.vessel;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header className="no-print" style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/spinytails')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 17 }}>📑 Processing Records — Batch Pull</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace' }}>{d?.batch_number || batch}</div>
          </div>
          <button onClick={() => window.print()} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>🖨️ Print audit file</button>
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '9px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠️ {err}</div>}
        {loading && !d && <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Assembling audit file…</div>}

        {d && (
          <>
            {/* Title block */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: INK, fontFamily: 'monospace' }}>{d.batch_number}</div>
                  <div style={{ color: '#64748b', fontSize: 13 }}>{fmt(d.species?.name) !== '—' ? String(d.species?.name) : fmt(lot.species_code)} · lot {fmt(lot.lot_code)}</div>
                </div>
                <span style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 999, fontWeight: 800, fontSize: 12, background: '#0f1a2e', color: GOLD }}>{String(d.summary.status ?? 'unknown').toUpperCase()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
                <Kpi label="Received" value={`${d.summary.received_lbs.toFixed(1)} lb`} />
                <Kpi label="Yield" value={d.summary.yield_pct != null ? `${d.summary.yield_pct}%` : '—'} />
                <Kpi label="Temp logs" value={String(d.summary.temp_readings)} />
                <Kpi label="QC checks" value={String(d.summary.qc_inspections)} />
                <Kpi label="Open CAPAs" value={String(d.summary.open_capas)} alert={d.summary.open_capas > 0} />
              </div>
              {vessel && <div style={{ marginTop: 12, fontSize: 12.5, color: '#475569' }}>🛥 <strong>{fmt(vessel.vessel_name)}</strong> ({fmt(vessel.vessel_code)}) · Fisherman {fmt(vessel.fisherman_name)} · License {fmt(vessel.license_number)}</div>}
            </div>

            {/* Alerts */}
            {(d.alerts.missing.length > 0 || d.alerts.nonconformance.length > 0) && (
              <div style={{ background: '#fff7ed', borderRadius: 14, border: '1px solid #fed7aa', padding: 14 }}>
                {d.alerts.nonconformance.length > 0 && <>
                  <div style={{ fontWeight: 900, fontSize: 13, color: '#c2410c', marginBottom: 6 }}>⚠️ Non-conformances ({d.alerts.nonconformance.length})</div>
                  {d.alerts.nonconformance.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: '#9a3412' }}>• {a}</div>)}
                </>}
                {d.alerts.missing.length > 0 && <div style={{ marginTop: d.alerts.nonconformance.length ? 10 : 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, color: '#b45309', marginBottom: 4 }}>📋 Missing documentation</div>
                  <div style={{ fontSize: 12.5, color: '#92400e' }}>{d.alerts.missing.join(' · ')}</div>
                </div>}
              </div>
            )}

            {/* Sections */}
            {SECTION_META.map(s => <Section key={s.key} title={s.title} icon={s.icon} records={d.sections[s.key] ?? []} />)}
          </>
        )}
      </main>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
    </div>
  );
}

function Kpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: alert ? '#dc2626' : INK }}>{value}</div><div style={{ fontSize: 10.5, color: '#64748b' }}>{label}</div></div>;
}

function Section({ title, icon, records }: { title: string; icon: string; records: Rec[] }) {
  const empty = records.length === 0;
  return (
    <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottom: empty ? 'none' : '1px solid #eef2f7' }}>
        <span style={{ fontWeight: 800, fontSize: 13.5, color: INK }}>{icon} {title}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: empty ? '#94a3b8' : '#16a34a' }}>{empty ? 'no records' : `${records.length} record${records.length === 1 ? '' : 's'}`}</span>
      </div>
      {!empty && records.map((rec, i) => (
        <div key={i} style={{ padding: '10px 14px', borderTop: i ? '1px solid #f1f5f9' : 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px' }}>
          {Object.entries(rec).filter(([k, v]) => !SKIP.has(k) && v != null && v !== '').map(([k, v]) => (
            <div key={k} style={{ fontSize: 11.5, minWidth: 0 }}>
              <span style={{ color: '#94a3b8' }}>{titleize(k)}: </span>
              <span style={{ color: '#1e293b', fontWeight: 600, wordBreak: 'break-word' }}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
