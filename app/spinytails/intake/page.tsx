'use client';

// /spinytails/intake — Step 1-2, CCP-1 (receiving).
//
// Single page that:
//   1. Optionally pulls an already-approved /lobster-intake yield_lot
//      (so admin doesn't re-type weight + vessel info captured upstream)
//   2. Generates the next lot code via spinytails_next_lot_code() RPC
//   3. Inserts spinytails_lots → spinytails_lot_intakes → optional
//      spinytails_quality_inspections in a single submit
//   4. Surfaces CCP-1 temperature constraints (fresh ≤40°F, frozen ≤0°F)
//      as inline validation BEFORE the DB rejects the row.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Next 15 requires useSearchParams() inside a Suspense boundary on
// client routes. The default export wraps IntakeFormInner in
// <Suspense>; force-dynamic alone wasn't sufficient on this 'use client' page.

export default function SpinytailsIntakePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#060d1f', color: '#fff', padding: 20 }}>Loading intake…</div>}>
      <IntakeFormInner />
    </Suspense>
  );
}

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface Vessel { id: string; vessel_code: string; fisherman_name: string; color_tag: string; status: string; }
interface YieldLot {
  id:                 string;
  lot_number:         string | null;
  received_date:      string;
  product_type:       string | null;
  source_type:        'tail' | 'whole' | null;
  whole_weight_lb:    number | null;
  clean_weight_lb:    number | null;
  captain_name:       string | null;
  vessel_name:        string | null;
  vessel_registration: string | null;
  supplier_id:        string | null;
  approval_status:    string;
  batch_id:           string | null;
}

function IntakeFormInner() {
  const params = useSearchParams();
  const prefillYieldId = params.get('yield_lot_id');

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [yieldLots, setYieldLots] = useState<YieldLot[]>([]);
  const [selectedYieldLot, setSelectedYieldLot] = useState<YieldLot | null>(null);

  // Form
  const [vesselId, setVesselId]       = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantityLbs, setQuantityLbs] = useState('');
  const [productState, setProductState] = useState<'fresh' | 'frozen'>('frozen');
  const [coreTempF, setCoreTempF]     = useState('');
  const [fishingArea, setFishingArea] = useState('');
  const [fishingDateStart, setFishingDateStart] = useState('');
  const [fishingDateEnd, setFishingDateEnd] = useState('');
  const [notes, setNotes]             = useState('');

  // First quality inspection (optional but recommended at intake — CCP-1)
  const [runInitialQc, setRunInitialQc] = useState(true);
  const [qcSampleLbs, setQcSampleLbs] = useState('');
  const [qcSulfitePpm, setQcSulfitePpm] = useState('');
  const [qcResult, setQcResult] = useState<'pass' | 'fail' | 'pending'>('pass');
  const [qcEggBearing, setQcEggBearing] = useState(false);
  const [qcSoftShell, setQcSoftShell] = useState(false);
  const [qcOffOdor, setQcOffOdor] = useState(false);
  const [qcForeignMatter, setQcForeignMatter] = useState(false);

  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ lot_code: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/spinytails/intake'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await loadVessels();
      await loadYieldLots();
    })();
  }, []);

  // If deep-linked from /lobster-intake, pull that yield_lot
  useEffect(() => {
    if (!prefillYieldId || yieldLots.length === 0) return;
    const yl = yieldLots.find(y => y.id === prefillYieldId);
    if (yl) applyYieldLot(yl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillYieldId, yieldLots]);

  // Live preview of the lot code as vessel/date changes
  useEffect(() => {
    (async () => {
      if (!vesselId) { setPreviewCode(null); return; }
      const v = vessels.find(x => x.id === vesselId);
      if (!v) { setPreviewCode(null); return; }
      const { data } = await supabase.rpc('spinytails_next_lot_code', {
        p_receipt_date: receiptDate,
        p_vessel_code: v.vessel_code,
      });
      setPreviewCode(typeof data === 'string' ? data : null);
    })();
  }, [vesselId, receiptDate, vessels]);

  async function loadVessels() {
    const { data } = await supabase.from('spinytails_vessels')
      .select('id, vessel_code, fisherman_name, color_tag, status')
      .eq('status', 'approved').order('vessel_code');
    setVessels((data ?? []) as Vessel[]);
  }

  async function loadYieldLots() {
    // Approved yield_lots that haven't been linked to a spinytails_lots row yet.
    const { data } = await supabase.from('yield_lots')
      .select('id, lot_number, received_date, product_type, source_type, whole_weight_lb, clean_weight_lb, captain_name, vessel_name, vessel_registration, supplier_id, approval_status, batch_id')
      .eq('approval_status', 'approved')
      .order('received_date', { ascending: false })
      .limit(40);
    setYieldLots((data ?? []) as YieldLot[]);
  }

  function applyYieldLot(yl: YieldLot) {
    setSelectedYieldLot(yl);
    setReceiptDate(yl.received_date || receiptDate);
    const weight = yl.whole_weight_lb ?? yl.clean_weight_lb;
    if (weight) setQuantityLbs(String(weight));
    // Try to match the upstream vessel info to a spinytails vessel
    if (yl.vessel_registration) {
      // No direct FK; best-effort match by code/name in notes
      const match = vessels.find(v =>
        v.fisherman_name.toLowerCase() === (yl.captain_name ?? '').toLowerCase()
      );
      if (match) setVesselId(match.id);
    }
  }

  function tempCompliant(): boolean | null {
    const t = parseFloat(coreTempF);
    if (isNaN(t)) return null;
    return productState === 'fresh' ? t <= 40.0 : t <= 0.0;
  }

  function validate(): string | null {
    if (!vesselId) return 'Pick a vessel';
    if (!receiptDate) return 'Receipt date required';
    const q = parseFloat(quantityLbs);
    if (isNaN(q) || q <= 0) return 'Quantity lbs must be > 0';
    if (coreTempF) {
      const t = parseFloat(coreTempF);
      if (isNaN(t)) return 'Core temp must be a number';
      if (productState === 'fresh' && t > 40.0) return `CCP-1 violation: fresh product must be ≤40°F (got ${t}°F). Run a corrective action or reject the lot.`;
      if (productState === 'frozen' && t > 0.0) return `CCP-1 violation: frozen product must be ≤0°F (got ${t}°F). Run a corrective action or reject the lot.`;
    }
    if (runInitialQc) {
      const s = parseFloat(qcSampleLbs);
      if (isNaN(s) || s <= 0) return 'QC sample lbs must be > 0 when running initial QC';
    }
    return null;
  }

  async function submit() {
    const e = validate();
    if (e) { setErr(e); return; }
    setErr(null); setSubmitting(true);
    try {
      const v = vessels.find(x => x.id === vesselId);
      if (!v) throw new Error('Vessel not found');

      // 1) Re-fetch the next lot code at submit time (avoids stale preview)
      const { data: codeData, error: codeErr } = await supabase.rpc('spinytails_next_lot_code', {
        p_receipt_date: receiptDate,
        p_vessel_code: v.vessel_code,
      });
      if (codeErr || !codeData) throw new Error(codeErr?.message ?? 'Failed to generate lot code');
      const lotCode = String(codeData);
      const seq     = parseInt(lotCode.slice(-2), 10);

      const { data: { user } } = await supabase.auth.getUser();

      // 2) Insert spinytails_lots
      const { data: lot, error: lotErr } = await supabase.from('spinytails_lots').insert({
        lot_code:       lotCode,
        receipt_date:   receiptDate,
        vessel_id:      vesselId,
        daily_sequence: seq,
        status:         'received',
        created_by:     user?.id ?? null,
      }).select('id').single();
      if (lotErr) throw lotErr;

      // 3) Insert lot_intake
      const tempOk = tempCompliant();
      const { error: intakeErr } = await supabase.from('spinytails_lot_intakes').insert({
        lot_id:                 lot.id,
        quantity_lbs:           parseFloat(quantityLbs),
        product_state:          productState,
        fishing_area:           fishingArea || null,
        fishing_date_start:     fishingDateStart || null,
        fishing_date_end:       fishingDateEnd || null,
        core_temp_f_at_receipt: coreTempF ? parseFloat(coreTempF) : null,
        received_by:            user?.id ?? null,
        notes:                  notes.trim() || (selectedYieldLot ? `Bridged from yield_lot ${selectedYieldLot.lot_number ?? selectedYieldLot.id}` : null),
      });
      if (intakeErr) throw intakeErr;

      // 4) Optional initial QC
      if (runInitialQc) {
        const { error: qcErr } = await supabase.from('spinytails_quality_inspections').insert({
          lot_id:               lot.id,
          sample_lbs:           parseFloat(qcSampleLbs),
          sulfite_ppm:          qcSulfitePpm ? parseFloat(qcSulfitePpm) : null,
          egg_bearing_found:    qcEggBearing,
          soft_shell_found:     qcSoftShell,
          off_odor:             qcOffOdor,
          foreign_matter_found: qcForeignMatter,
          result:               qcResult,
          qa_personnel:         user?.id ?? null,
          notes:                tempOk === false ? 'Receipt temp out of CCP-1 range — investigate' : null,
        });
        if (qcErr) throw qcErr;
      }

      // 5) If bridged from a yield_lot, stamp the yield_lot's approval_notes for the audit trail
      if (selectedYieldLot) {
        await supabase.from('yield_lots').update({
          approval_notes: `Sent to Spiny Tails as ${lotCode} on ${new Date().toISOString()}`,
        }).eq('id', selectedYieldLot.id);
      }

      setSuccess({ lot_code: lotCode });
      // Reset form
      setQuantityLbs(''); setCoreTempF(''); setFishingArea('');
      setFishingDateStart(''); setFishingDateEnd(''); setNotes('');
      setQcSampleLbs(''); setQcSulfitePpm('');
      setQcEggBearing(false); setQcSoftShell(false); setQcOffOdor(false); setQcForeignMatter(false);
      setSelectedYieldLot(null);
      // Reload yield_lots so the just-bridged one falls off the list
      await loadYieldLots();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setSubmitting(false);
    }
  }

  const v = vessels.find(x => x.id === vesselId);
  const tc = tempCompliant();
  const unlinkedYieldLots = useMemo(() => yieldLots, [yieldLots]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Link href="/spinytails" style={back}>← Spiny Tails</Link>
          <h1 style={h1}>📥 Step 1-2 · Intake (CCP-1)</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Generates a fresh lot code, captures receipt + initial QC.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        {success && (
          <div style={{ background: 'rgba(74,222,128,0.18)', border: '1px solid #16a34a', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 800 }}>✓ Lot created</div>
            <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'monospace', color: '#fff', marginTop: 4 }}>{success.lot_code}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Link href={`/spinytails/lots/${encodeURIComponent(success.lot_code)}`}
                style={{ background: '#f5c518', color: '#060d1f', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                Open lot →
              </Link>
              <button onClick={() => setSuccess(null)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                + Another intake
              </button>
            </div>
          </div>
        )}

        {/* Pull from /lobster-intake bridge */}
        {!selectedYieldLot && unlinkedYieldLots.length > 0 && !success && (
          <div style={{ background: '#0f1f3d', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              📥 Pull from approved /lobster-intake
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '0 0 8px' }}>
              Skip re-typing weight + vessel info — pick an approved yield_lot to pre-fill this form.
            </p>
            <select onChange={(e) => {
              const yl = unlinkedYieldLots.find(y => y.id === e.target.value);
              if (yl) applyYieldLot(yl);
            }} value="" style={inp}>
              <option value="">— pick an approved intake —</option>
              {unlinkedYieldLots.slice(0, 20).map(y => (
                <option key={y.id} value={y.id}>
                  {y.received_date} · {y.product_type} · {Number(y.whole_weight_lb || y.clean_weight_lb || 0).toFixed(0)} lbs
                  {y.captain_name ? ` · ${y.captain_name}` : ''}
                  {y.lot_number ? ` · ${y.lot_number}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedYieldLot && (
          <div style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid #60a5fa', borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 12 }}>
            <strong style={{ color: '#60a5fa' }}>Bridged from yield_lot</strong>{' '}
            <span style={{ fontFamily: 'monospace' }}>{selectedYieldLot.lot_number}</span>
            {' '}— vessel + weight pre-filled. Adjust if needed.
            <button onClick={() => setSelectedYieldLot(null)} style={{ marginLeft: 8, background: 'transparent', color: '#94a3b8', border: '1px solid #94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Unlink
            </button>
          </div>
        )}

        <div style={card}>
          <Field label="Vessel">
            <select value={vesselId} onChange={(e) => setVesselId(e.target.value)} style={inp}>
              <option value="">— select vessel —</option>
              {vessels.map(v => <option key={v.id} value={v.id}>{v.vessel_code} · {v.fisherman_name} · {v.color_tag}</option>)}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Receipt date">
              <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} style={inp} />
            </Field>
            <Field label="Lot code (auto)">
              <input value={previewCode ?? '— pick vessel + date —'} readOnly style={{ ...inp, background: '#0a1628', fontFamily: 'monospace', fontWeight: 800, color: '#f5c518' }} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Quantity (lbs)">
              <input type="number" inputMode="decimal" step="0.01" min="0" value={quantityLbs}
                onChange={(e) => setQuantityLbs(e.target.value)} placeholder="e.g. 240.5" style={inp} />
            </Field>
            <Field label="Product state">
              <select value={productState} onChange={(e) => setProductState(e.target.value as 'fresh' | 'frozen')} style={inp}>
                <option value="frozen">frozen</option>
                <option value="fresh">fresh</option>
              </select>
            </Field>
          </div>

          <Field label={`Core temp at receipt (°F) — CCP-1: ${productState === 'fresh' ? 'fresh ≤40°F' : 'frozen ≤0°F'}`}>
            <input type="number" inputMode="decimal" step="0.1" value={coreTempF}
              onChange={(e) => setCoreTempF(e.target.value)} placeholder={productState === 'fresh' ? '≤40.0' : '≤0.0'} style={{
                ...inp,
                borderColor: tc === null ? 'rgba(245,197,24,0.25)' : tc ? '#16a34a' : '#dc2626',
                background: tc === null ? '#060d1f' : tc ? 'rgba(34,197,94,0.05)' : 'rgba(248,113,113,0.08)',
              }} />
            {tc === false && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>
                ⚠ Out of CCP-1 range — submit will be rejected by DB unless you raise a corrective action.
              </div>
            )}
            {tc === true && (
              <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>✓ Within CCP-1 limit</div>
            )}
          </Field>

          <Field label="Fishing area">
            <input value={fishingArea} onChange={(e) => setFishingArea(e.target.value)} placeholder="e.g. Moores Island grounds" style={inp} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Fishing date — start">
              <input type="date" value={fishingDateStart} onChange={(e) => setFishingDateStart(e.target.value)} style={inp} />
            </Field>
            <Field label="Fishing date — end">
              <input type="date" value={fishingDateEnd} onChange={(e) => setFishingDateEnd(e.target.value)} style={inp} />
            </Field>
          </div>

          <Field label="Notes">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ice condition, paperwork, anything to flag" style={inp} />
          </Field>
        </div>

        <div style={card}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={runInitialQc} onChange={(e) => setRunInitialQc(e.target.checked)} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1 }}>Run initial QC inspection (Step 2)</span>
          </label>
          {runInitialQc && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Sample lbs">
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={qcSampleLbs}
                    onChange={(e) => setQcSampleLbs(e.target.value)} placeholder="e.g. 5.0" style={inp} />
                </Field>
                <Field label="Sulfite ppm">
                  <input type="number" inputMode="decimal" step="0.1" min="0" value={qcSulfitePpm}
                    onChange={(e) => setQcSulfitePpm(e.target.value)} placeholder="≤100" style={inp} />
                </Field>
              </div>
              <Field label="Result">
                <select value={qcResult} onChange={(e) => setQcResult(e.target.value as 'pass' | 'fail' | 'pending')} style={inp}>
                  <option value="pass">pass</option>
                  <option value="fail">fail</option>
                  <option value="pending">pending</option>
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                <Check label="Egg-bearing found"    v={qcEggBearing}    onChange={setQcEggBearing} />
                <Check label="Soft shell found"     v={qcSoftShell}     onChange={setQcSoftShell} />
                <Check label="Off odor"             v={qcOffOdor}       onChange={setQcOffOdor} />
                <Check label="Foreign matter found" v={qcForeignMatter} onChange={setQcForeignMatter} />
              </div>
            </>
          )}
        </div>

        {err && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
            ⚠ {err}
          </div>
        )}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10, padding: '12px 14px', fontSize: 14, fontWeight: 900, cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
          {submitting ? 'Saving…' : `✓ Create lot ${previewCode ? `· ${previewCode}` : ''}`}
        </button>

        {v && previewCode && !success && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10 }}>
            Next code: <strong style={{ color: '#f5c518', fontFamily: 'monospace' }}>{previewCode}</strong> · {v.fisherman_name} ({v.color_tag})
          </p>
        )}
      </main>
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

function Check({ label, v, onChange }: { label: string; v: boolean; onChange: (b: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1' }}>
      <input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 12, padding: 14, marginBottom: 12 };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, boxSizing: 'border-box' };
