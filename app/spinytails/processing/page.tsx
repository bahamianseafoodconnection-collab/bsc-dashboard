'use client';

// /spinytails/processing — Processing Station device (Phase 3)
//
// Freezer removal (purpose + weight reconciliation) → start processing (DB
// no-mixing lock) → ordered species steps → completion (yield/loss/remaining)
// → tray label. The permanent batch number threads through unchanged.

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { printLabels } from '@/lib/label-print';

export const dynamic = 'force-dynamic';

interface Lot { id: string; batch_number: string | null; lot_code: string; species_code: string | null; status: string; }
interface Species { code: string; name: string; processing_types: string[]; }
const DEVICE_ID = 'PROCESSING-STATION-1';
const PURPOSES = ['processing','pos_nassau','pos_andros','wholesale','export','sampling','qc','disposal'];

export default function ProcessingStationPage() {
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [lots, setLots] = useState<Lot[]>([]);
  const [species, setSpecies] = useState<Record<string, Species>>({});
  const [lotId, setLotId] = useState('');
  const [recv, setRecv] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // freezer removal
  const [rmWeight, setRmWeight] = useState(''); const [rmPurpose, setRmPurpose] = useState('processing');
  const [rmTray, setRmTray] = useState(''); const [rmRack, setRmRack] = useState(''); const [rmFreezer, setRmFreezer] = useState(''); const [rmStorage, setRmStorage] = useState('');
  // processing
  const [pbId, setPbId] = useState<string | null>(null);
  const [startWt, setStartWt] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  // complete
  const [finName, setFinName] = useState(''); const [finWt, setFinWt] = useState(''); const [pkgs, setPkgs] = useState('');
  const [cTray, setCTray] = useState(''); const [cRack, setCRack] = useState(''); const [cFreezer, setCFreezer] = useState('');
  const [done, setDone] = useState<{ yield_pct: number | null; loss: number | null; remaining: number | null } | null>(null);
  const printedTray = useRef('');

  const lot = lots.find((l) => l.id === lotId);
  const sp = lot?.species_code ? species[lot.species_code] : undefined;
  const batch = lot?.batch_number ?? lot?.lot_code ?? '';
  const processing = lot?.status === 'processing';

  function flash(ok: boolean, msg: string) { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); }

  async function load() {
    const [{ data: ls }, { data: sps }] = await Promise.all([
      supabase.from('spinytails_lots').select('id, batch_number, lot_code, species_code, status')
        .in('status', ['received','in_receiving_freezer','thawing','processing']).order('receipt_date', { ascending: false }),
      supabase.from('spinytails_species').select('code, name, processing_types'),
    ]);
    setLots((ls ?? []) as Lot[]);
    const m: Record<string, Species> = {};
    for (const s of (sps ?? []) as Species[]) m[s.code] = s;
    setSpecies(m);
  }

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    if (!role || !['founder','co_founder','control_admin','manager','processor','receiver','qc_staff'].includes(role)) { setAuth('forbidden'); return; }
    setAuth('ok'); load();
  })(); }, []);

  async function selectLot(id: string) {
    setLotId(id); setPbId(null); setSteps([]); setDone(null);
    const l = lots.find((x) => x.id === id); if (!l) return;
    const bn = l.batch_number ?? l.lot_code;
    const [{ data: intakes }, { data: removals }] = await Promise.all([
      supabase.from('spinytails_lot_intakes').select('quantity_lbs').eq('lot_id', id),
      supabase.from('spinytails_freezer_removals').select('weight_removed_lbs').eq('batch_number', bn),
    ]);
    const received = (intakes ?? []).reduce((s, r) => s + Number((r as { quantity_lbs: number | null }).quantity_lbs ?? 0), 0);
    const removed = (removals ?? []).reduce((s, r) => s + Number((r as { weight_removed_lbs: number | null }).weight_removed_lbs ?? 0), 0);
    setRecv(Math.round(received * 100) / 100); setRemaining(Math.round((received - removed) * 100) / 100);
  }

  async function call(payload: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/spinytails/processing', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ lot_id: lotId, batch_number: batch, device_id: DEVICE_ID, ...payload }),
    });
    return res.json();
  }

  async function recordRemoval() {
    if (!(parseFloat(rmWeight) > 0)) { flash(false, 'Enter weight removed'); return; }
    setBusy(true);
    const j = await call({ action: 'freezer_removal', weight_removed_lbs: parseFloat(rmWeight), purpose: rmPurpose,
      tray_number: rmTray || null, rack_number: rmRack || null, blast_freezer_location: rmFreezer || null, storage_location: rmStorage || null,
      product_name: sp?.name ?? null });
    setBusy(false);
    if (!j.ok) { flash(false, j.error); return; }
    setRemaining(j.remaining_lbs);
    flash(j.overdraw, j.overdraw ? `⚠ Over-draw! Remaining now ${j.remaining_lbs} lb` : `Removed — remaining ${j.remaining_lbs} lb`);
    setRmWeight('');
  }

  async function startProcessing() {
    setBusy(true);
    const j = await call({ action: 'start', starting_weight_lbs: startWt ? parseFloat(startWt) : null });
    setBusy(false);
    if (!j.ok) { flash(false, j.error); return; }
    setPbId(j.processing_batch_id);
    flash(true, 'Processing started (batch locked — no mixing)');
    await load();
  }

  async function recordStep(name: string) {
    setBusy(true);
    const j = await call({ action: 'step', step_no: steps.length + 1, step_name: name });
    setBusy(false);
    if (!j.ok) { flash(false, j.error); return; }
    setSteps((s) => [...s, name]);
  }

  async function complete() {
    if (!pbId) { flash(false, 'Start processing first'); return; }
    if (!(parseFloat(finWt) > 0)) { flash(false, 'Enter finished weight'); return; }
    setBusy(true);
    const j = await call({ action: 'complete', processing_batch_id: pbId, finished_product_name: finName || sp?.name,
      finished_weight_lbs: parseFloat(finWt), packages_produced: pkgs ? parseInt(pkgs, 10) : null,
      tray_number: cTray || null, rack_number: cRack || null, blast_freezer_location: cFreezer || null });
    setBusy(false);
    if (!j.ok) { flash(false, j.error); return; }
    setDone({ yield_pct: j.yield_pct, loss: j.processing_loss_lbs, remaining: j.remaining_raw_lbs });
    flash(true, `Complete · yield ${j.yield_pct ?? '—'}%`);
    await load();
  }

  function printTray() {
    printLabels([{
      title: 'TRAY', product_name: finName || sp?.name || '', batch_number: batch,
      weight: finWt ? `${finWt} lb` : '', date: new Date().toLocaleDateString('en-US'),
      tray_number: cTray, rack_number: cRack,
      extra: [cFreezer ? { label: 'Blast Freezer', value: cFreezer } : { label: 'Species', value: sp?.name ?? '' }],
    }], { widthIn: 4, heightIn: 6 });
    printedTray.current = batch;
  }

  if (auth === 'checking') return <C>Checking…</C>;
  if (auth === 'no') return <C>Sign in required. <Link href="/staff-login?next=/spinytails/processing" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></C>;
  if (auth === 'forbidden') return <C>Processing / QC staff only.</C>;

  const inp: React.CSSProperties = { width: '100%', padding: 13, fontSize: 16, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6 };
  const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '10px 18px', borderRadius: 10, fontWeight: 800, background: toast.ok ? '#dcfce7' : '#fee2e2', color: toast.ok ? '#166534' : '#991b1b', border: `2px solid ${toast.ok ? '#16a34a' : '#dc2626'}` }}>{toast.msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>⚙️ Processing Station</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      <div style={sec}>
        <div style={lbl}>Batch</div>
        <select value={lotId} onChange={(e) => selectLot(e.target.value)} style={inp}>
          <option value="">— select batch —</option>
          {lots.map((l) => <option key={l.id} value={l.id}>{l.batch_number ?? l.lot_code} · {l.species_code} · {l.status}</option>)}
        </select>
        {lot && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 14 }}>
            <span>Received <b>{recv} lb</b></span><span>·</span><span>Remaining <b style={{ color: remaining < 0 ? '#dc2626' : '#16a34a' }}>{remaining} lb</b></span>
            <span style={{ marginLeft: 'auto', fontWeight: 800, color: processing ? '#dc2626' : '#475569' }}>{processing ? '🔒 PROCESSING' : lot.status}</span>
          </div>
        )}
      </div>

      {lot && <>
        {/* Freezer removal */}
        <div style={sec}>
          <div style={lbl}>Freezer removal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div style={lbl}>Weight (lb)</div><input type="number" inputMode="decimal" value={rmWeight} onChange={(e) => setRmWeight(e.target.value)} style={inp} /></div>
            <div><div style={lbl}>Purpose</div><select value={rmPurpose} onChange={(e) => setRmPurpose(e.target.value)} style={inp}>{PURPOSES.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <input placeholder="Tray #" value={rmTray} onChange={(e) => setRmTray(e.target.value)} style={inp} />
            <input placeholder="Rack #" value={rmRack} onChange={(e) => setRmRack(e.target.value)} style={inp} />
            <input placeholder="Blast freezer" value={rmFreezer} onChange={(e) => setRmFreezer(e.target.value)} style={inp} />
          </div>
          <button onClick={recordRemoval} disabled={busy} style={{ ...inp, background: '#0b1628', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Record removal</button>
        </div>

        {/* Processing */}
        <div style={sec}>
          <div style={lbl}>Processing</div>
          {!processing ? (
            <>
              <div style={lbl}>Starting weight (lb)</div>
              <input type="number" inputMode="decimal" value={startWt} onChange={(e) => setStartWt(e.target.value)} style={inp} />
              <button onClick={startProcessing} disabled={busy} style={{ ...inp, background: '#f5c518', color: '#0b1628', fontWeight: 900, cursor: 'pointer' }}>▶ Start processing (locks batch — no mixing)</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>Tap each step as completed:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(sp?.processing_types ?? []).map((st, i) => {
                  const recorded = steps.includes(st);
                  return <button key={i} onClick={() => recordStep(st)} disabled={busy || recorded} style={{ padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, border: '2px solid', borderColor: recorded ? '#16a34a' : '#cbd5e1', background: recorded ? '#16a34a' : '#fff', color: recorded ? '#fff' : '#0b1628' }}>{recorded ? '✓ ' : ''}{st}</button>;
                })}
              </div>
              {steps.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Recorded: {steps.map((s, i) => `${i + 1}. ${s}`).join('  →  ')}</div>}
            </>
          )}
        </div>

        {/* Completion */}
        {processing && (
          <div style={sec}>
            <div style={lbl}>Completion</div>
            <input placeholder="Finished product name" value={finName} onChange={(e) => setFinName(e.target.value)} style={inp} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div style={lbl}>Finished weight (lb)</div><input type="number" inputMode="decimal" value={finWt} onChange={(e) => setFinWt(e.target.value)} style={inp} /></div>
              <div><div style={lbl}># Packages</div><input type="number" inputMode="numeric" value={pkgs} onChange={(e) => setPkgs(e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <input placeholder="Tray #" value={cTray} onChange={(e) => setCTray(e.target.value)} style={inp} />
              <input placeholder="Rack #" value={cRack} onChange={(e) => setCRack(e.target.value)} style={inp} />
              <input placeholder="Blast freezer" value={cFreezer} onChange={(e) => setCFreezer(e.target.value)} style={inp} />
            </div>
            <button onClick={complete} disabled={busy} style={{ ...inp, background: '#16a34a', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>✓ Complete processing</button>
          </div>
        )}

        {done && (
          <div style={{ ...sec, border: '2px solid #16a34a', background: '#f0fdf4' }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 15 }}>
              <span>Yield <b>{done.yield_pct ?? '—'}%</b></span>
              <span>Loss <b>{done.loss ?? '—'} lb</b></span>
              <span>Remaining raw <b>{done.remaining ?? '—'} lb</b></span>
            </div>
            <button onClick={printTray} style={{ ...inp, background: '#0b1628', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>🖨 Print tray label (Rollo · batch + QR + barcode)</button>
          </div>
        )}
      </>}
    </div>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}
