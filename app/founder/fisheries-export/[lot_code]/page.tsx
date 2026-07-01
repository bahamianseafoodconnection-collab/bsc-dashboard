'use client';

// /founder/fisheries-export/[lot_code] — Bahamas Fisheries Export Packet.
//
// Auto-assembles the compliance packet for a batch from data staff already
// entered — the 7 record types (receiving-QC, daily processing, chill-bin temps,
// freezer temps, SSOP sanitation, finished cases, yield) — each stamped with the
// Spiny Tails plant identity + a verifier signature block. Print → Save as PDF
// (email send is v2). "Save packet" records it in spinytails_fisheries_packets.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { SPINYTAILS_PLANT } from '@/lib/spinytails-product-label';

export const dynamic = 'force-dynamic';

const VERIFIERS = ['Dedrick', 'TJ', 'Jaquel', 'Nicholson'];
type Row = Record<string, unknown>;

export default function FisheriesExportPacketPage() {
  const params = useParams<{ lot_code: string }>();
  const lotCode = decodeURIComponent(params?.lot_code ?? '');
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [verifier, setVerifier] = useState('');
  const [saved, setSaved] = useState(false);

  const [lot, setLot] = useState<Row | null>(null);
  const [vessel, setVessel] = useState<Row | null>(null);
  const [species, setSpecies] = useState<Row | null>(null);
  const [intakes, setIntakes] = useState<Row[]>([]);
  const [rqc, setRqc] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [steps, setSteps] = useState<Row[]>([]);
  const [temps, setTemps] = useState<Row[]>([]);
  const [ssop, setSsop] = useState<Row[]>([]);
  const [cases, setCases] = useState<Row[]>([]);

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    if (!role || !['founder','co_founder','control_admin'].includes(role)) { setAuth('forbidden'); return; }
    setAuth('ok'); await load();
  })(); }, [lotCode]);

  async function load() {
    setLoading(true); setErr('');
    const { data: l } = await supabase.from('spinytails_lots').select('*')
      .or(`lot_code.eq.${lotCode},batch_number.eq.${lotCode}`).maybeSingle();
    if (!l) { setErr(`No batch found for "${lotCode}".`); setLoading(false); return; }
    setLot(l as Row);
    const lotId = (l as Row).id as string;
    const from = String((l as Row).receipt_date ?? (l as Row).created_at ?? '').slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    const [v, sp, ints, qc, pb, st, tp, cs, ss] = await Promise.all([
      (l as Row).vessel_id ? supabase.from('spinytails_vessels').select('*').eq('id', (l as Row).vessel_id as string).maybeSingle() : Promise.resolve({ data: null }),
      (l as Row).species_code ? supabase.from('spinytails_species').select('code, name, scientific_name').eq('code', (l as Row).species_code as string).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('spinytails_lot_intakes').select('*').eq('lot_id', lotId).order('intake_time'),
      supabase.from('spinytails_receiving_qc').select('*').eq('lot_id', lotId).order('time_received'),
      supabase.from('spinytails_processing_batches').select('*').eq('lot_id', lotId).order('started_at'),
      supabase.from('spinytails_processing_steps').select('*').eq('lot_id', lotId).order('recorded_at'),
      supabase.from('spinytails_temperature_logs').select('*').eq('lot_id', lotId).order('logged_at'),
      supabase.from('spinytails_cases').select('*').eq('lot_id', lotId).order('case_code'),
      from ? supabase.from('spinytails_sanitation_checklist').select('*').gte('checklist_date', from).lte('checklist_date', to).order('checklist_date') : Promise.resolve({ data: [] }),
    ]);
    setVessel((v.data as Row) ?? null); setSpecies((sp.data as Row) ?? null);
    setIntakes((ints.data ?? []) as Row[]); setRqc((qc.data ?? []) as Row[]);
    setBatches((pb.data ?? []) as Row[]); setSteps((st.data ?? []) as Row[]);
    setTemps((tp.data ?? []) as Row[]); setCases((cs.data ?? []) as Row[]);
    setSsop((ss.data ?? []) as Row[]);
    setLoading(false);
  }

  const chill = useMemo(() => temps.filter((t) => t.location === 'thaw_vat'), [temps]);
  const freezerTemps = useMemo(() => temps.filter((t) => t.location === 'blast_freezer' || t.location === 'distribution_freezer'), [temps]);
  const received = useMemo(() => intakes.reduce((s, r) => s + Number(r.quantity_lbs ?? 0), 0), [intakes]);
  const boxed = useMemo(() => cases.reduce((s, c) => s + Number(c.net_weight_lbs ?? 0), 0), [cases]);

  async function savePacket() {
    if (!lot) return;
    const { data: { session } } = await supabase.auth.getSession();
    const snapshot = { received_lbs: received, boxed_lbs: boxed, cases: cases.length, ssop_days: ssop.length, temp_readings: temps.length };
    const { error } = await supabase.from('spinytails_fisheries_packets').insert({
      lot_code: lotCode, batch_number: (lot.batch_number as string) ?? lotCode, status: 'generated',
      record_snapshot: snapshot, verifier_name: verifier || null,
      generated_by: session?.user?.id ?? null, generated_at: new Date().toISOString(),
    });
    if (error) { setErr(error.message); return; }
    setSaved(true);
  }

  if (auth === 'checking') return <Ctr>Checking…</Ctr>;
  if (auth === 'no') return <Ctr>Sign in required. <Link href={`/staff-login?next=/founder/fisheries-export/${encodeURIComponent(lotCode)}`} style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></Ctr>;
  if (auth === 'forbidden') return <Ctr>Founder / admin only.</Ctr>;
  if (loading) return <Ctr>Assembling packet…</Ctr>;
  if (err) return <Ctr>⚠ {err}</Ctr>;

  const dt = (v: unknown) => v ? new Date(String(v)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const yn = (v: unknown) => v === true ? 'Y' : v === false ? 'N' : '—';

  return (
    <div className="packet">
      <style>{`
        .packet { max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; color: #111; background: #fff; }
        .noprint button, .noprint select { font-size: 14px; }
        .plant { text-align: center; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
        .plant .nm { font-size: 18px; font-weight: 900; }
        .plant .sm { font-size: 11px; }
        .rec { border: 1px solid #999; border-radius: 6px; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
        .rec h3 { margin: 0 0 8px; font-size: 14px; background: #eee; padding: 5px 8px; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #bbb; padding: 3px 6px; text-align: left; }
        th { background: #f3f3f3; }
        .sig { display: flex; gap: 40px; margin-top: 10px; font-size: 12px; }
        .sig div { flex: 1; border-top: 1px solid #000; padding-top: 4px; }
        @media print { .noprint { display: none !important; } .packet { padding: 0; } }
      `}</style>

      <div className="noprint" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/dashboard" style={{ fontSize: 12, color: '#1a2e5a' }}>← Control</Link>
        <select value={verifier} onChange={(e) => setVerifier(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '2px solid #cbd5e1' }}>
          <option value="">— verifier —</option>
          {VERIFIERS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#0b1628', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>🖨 Print / Save PDF</button>
        <button onClick={savePacket} disabled={saved} style={{ padding: '8px 16px', background: saved ? '#16a34a' : '#f5c518', color: saved ? '#fff' : '#0b1628', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>{saved ? '✓ Saved' : '💾 Save packet'}</button>
      </div>

      <div className="plant">
        <div className="nm">{SPINYTAILS_PLANT.name}</div>
        <div className="sm">{SPINYTAILS_PLANT.address} · {SPINYTAILS_PLANT.fda} · {SPINYTAILS_PLANT.plant}</div>
        <div className="sm">{SPINYTAILS_PLANT.email}</div>
        <div style={{ fontSize: 15, fontWeight: 900, marginTop: 6 }}>BAHAMAS FISHERIES EXPORT PACKET</div>
        <div style={{ fontSize: 12 }}>Lot / Batch <b>{String(lot?.batch_number ?? lot?.lot_code ?? lotCode)}</b> · {String(species?.name ?? lot?.species_code ?? '')} · Boat {String(vessel?.vessel_name ?? vessel?.fisherman_name ?? '—')} · Received {String(lot?.receipt_date ?? '')}</div>
      </div>

      {/* 1 · Receiving Log */}
      <div className="rec"><h3>1 · Receiving Log</h3>
        <table><thead><tr><th>Time</th><th>Temp °F</th><th>Egg</th><th>Discolor</th><th>Softshell</th><th>Undersized</th><th>Odor</th><th>Weight</th><th>Bag/Lot#</th></tr></thead><tbody>
          {rqc.length === 0 && <tr><td colSpan={9}>No receiving-QC record</td></tr>}
          {rqc.map((r, i) => <tr key={i}><td>{dt(r.time_received)}</td><td>{String(r.core_surface_temp_f ?? '—')}</td><td>{yn(r.egg_bearing)}</td><td>{yn(r.discoloration)}</td><td>{yn(r.softshell_damage)}</td><td>{yn(r.undersized)}</td><td>{yn(r.odor)}</td><td>{String(r.weight_lbs ?? '—')}</td><td>{String(r.lot_bag_no ?? '—')}</td></tr>)}
        </tbody></table>
      </div>

      {/* 2 · Daily Processing */}
      <div className="rec"><h3>2 · Daily Processing Form</h3>
        <table><thead><tr><th>Step</th><th>When</th><th>Weight lb</th></tr></thead><tbody>
          {steps.length === 0 && batches.length === 0 && <tr><td colSpan={3}>No processing record</td></tr>}
          {steps.map((s, i) => <tr key={i}><td>{String(s.step_name ?? '')}</td><td>{dt(s.recorded_at)}</td><td>{String(s.weight_lbs ?? '—')}</td></tr>)}
          {batches.map((b, i) => <tr key={`b${i}`}><td>Batch (sulfite {String(b.sulfite_recheck_ppm ?? '—')}ppm)</td><td>{dt(b.started_at)} → {dt(b.ended_at)}</td><td>in {String(b.lbs_in ?? '—')} / out {String(b.finished_weight_lbs ?? '—')}</td></tr>)}
        </tbody></table>
      </div>

      {/* 3 · Chill Bin (defrost) */}
      <div className="rec"><h3>3 · Chill Bin (defrost) Temperature Log</h3>
        <table><thead><tr><th>Time</th><th>Temp °F</th><th>Within 32°F</th></tr></thead><tbody>
          {chill.length === 0 && <tr><td colSpan={3}>No chill-bin log</td></tr>}
          {chill.map((t, i) => <tr key={i}><td>{dt(t.logged_at)}</td><td>{String(t.reading_f)}</td><td>{t.within_limit ? '✓' : '⚠'}</td></tr>)}
        </tbody></table>
      </div>

      {/* 4 · Freezer Temperature Logs */}
      <div className="rec"><h3>4 · Freezer Temperature Logs</h3>
        <table><thead><tr><th>Time</th><th>Freezer</th><th>Temp °F</th><th>Within</th></tr></thead><tbody>
          {freezerTemps.length === 0 && <tr><td colSpan={4}>No freezer log for this lot</td></tr>}
          {freezerTemps.map((t, i) => <tr key={i}><td>{dt(t.logged_at)}</td><td>{String(t.location).replace('_', ' ')}</td><td>{String(t.reading_f)}</td><td>{t.within_limit ? '✓' : '⚠'}</td></tr>)}
        </tbody></table>
      </div>

      {/* 5 · Daily Sanitation (SSOP) */}
      <div className="rec"><h3>5 · Daily Sanitation Checklist (SSOP)</h3>
        <table><thead><tr><th>Date</th><th>Start/End</th><th>Fails</th><th>Chlorine ppm</th><th>Verified by</th></tr></thead><tbody>
          {ssop.length === 0 && <tr><td colSpan={5}>No SSOP checklist in window</td></tr>}
          {ssop.map((s, i) => {
            const grades = (s.grades ?? {}) as Record<string, { start?: string; end?: string }>;
            const fails = Object.entries(grades).filter(([, g]) => g.start === 'F' || g.end === 'F').map(([k]) => k);
            return <tr key={i}><td>{String(s.checklist_date)}</td><td>{String(s.start_time ?? '').slice(0,5)} / {String(s.end_time ?? '').slice(0,5)}</td><td>{fails.length ? fails.join(', ') : 'none'}</td><td>{String(s.chlorine_ppm_start ?? '—')}/{String(s.chlorine_ppm_end ?? '—')}</td><td>{String(s.verified_by_name ?? '—')}</td></tr>;
          })}
        </tbody></table>
      </div>

      {/* 6 · Finished labels / cases */}
      <div className="rec"><h3>6 · Finished Product Cases</h3>
        <table><thead><tr><th>Case code</th><th>Size / clean</th><th>Net lb</th><th>Best used by</th><th>Status</th></tr></thead><tbody>
          {cases.length === 0 && <tr><td colSpan={5}>No cases yet</td></tr>}
          {cases.map((c, i) => <tr key={i}><td>{String(c.case_code)}</td><td>{c.product_type === 'conch' ? `${c.conch_clean_pct ?? '—'}%` : String(c.grade ?? '—')}</td><td>{String(c.net_weight_lbs)}</td><td>{String(c.best_used_by ?? '—')}</td><td>{String(c.status)}</td></tr>)}
        </tbody></table>
      </div>

      {/* 7 · Yield summary */}
      <div className="rec"><h3>7 · Yield Summary</h3>
        <table><tbody>
          <tr><th>Received (lb)</th><td>{received.toFixed(1)}</td><th>Boxed finished (lb)</th><td>{boxed.toFixed(1)}</td></tr>
          <tr><th>Yield loss (lb)</th><td>{(received - boxed).toFixed(1)}</td><th>Yield %</th><td>{received > 0 ? ((boxed / received) * 100).toFixed(1) : '—'}%</td></tr>
        </tbody></table>
      </div>

      <div className="sig">
        <div>Verified by: <b>{verifier || '________________'}</b></div>
        <div>Date: {new Date().toLocaleDateString('en-US')}</div>
      </div>
    </div>
  );
}

function Ctr({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}
