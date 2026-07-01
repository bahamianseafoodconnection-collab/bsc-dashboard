'use client';

// /spinytails/receiving — Receiving Station device
//
// Tablet-optimized station for the Receiving Department. Captures supplier
// (approved vessel), product, harvest verification (GPS photos), and a
// species-aware receiving inspection, then generates the permanent
// species-prefixed batch number (CON-/LOB-/SNP-YYYYMMDD-NNN) server-side so
// staff recognize product type by eye on the bin + tie-strap. CCP-1 (temp +
// sulfite) is validated against the species' configured limits on submit.
//
// Cold-chain additions: color tie-strap (new or reused-from-freezer),
// holding-freezer location, a scanned bag/barcode, and the 5 Fisheries
// Receiving-Log QC flags (egg-bearing / discoloration / softshell / undersized
// / odor). The receiving label prints the batch code + color strap + barcode.

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { printLabels } from '@/lib/label-print';

export const dynamic = 'force-dynamic';

interface Species { code: string; name: string; grade_set: string[]; qc_fields: string[]; ccp_limits: Record<string, unknown>; }
interface Vessel { id: string; vessel_code: string | null; vessel_name: string | null; fisherman_name: string | null; captain_name: string | null; fisherman_phone: string | null; license_number: string | null; color_tag: string | null; }
interface Photo { url: string; lat: number | null; lng: number | null; captured_at: string; }
interface LabelData { batch_number: string; species: string; boat: string; captain: string; registration: string | null; color_strap: string; reused: boolean; barcode: string | null; temp_f: number | null; receipt_date: string; }
type RQ = { egg_bearing: boolean; discoloration: boolean; softshell_damage: boolean; undersized: boolean; odor: boolean };

const DEVICE_ID = 'RECEIVING-STATION-1';
const RQ_FIELDS: { key: keyof RQ; label: string }[] = [
  { key: 'egg_bearing',      label: 'Egg-bearing' },
  { key: 'discoloration',    label: 'Discoloration' },
  { key: 'softshell_damage', label: 'Softshell / damage' },
  { key: 'undersized',       label: 'Undersized' },
  { key: 'odor',             label: 'Off-odor' },
];

export default function ReceivingStationPage() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [auth, setAuth] = useState<'checking' | 'no' | 'forbidden' | 'ok'>('checking');

  // form
  const [vesselId, setVesselId] = useState('');
  const [speciesCode, setSpeciesCode] = useState('');
  const [productName, setProductName] = useState('');
  const [numBags, setNumBags] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [weightPerBag, setWeightPerBag] = useState('');
  const [state, setState] = useState<'fresh' | 'frozen'>('fresh');
  const [grade, setGrade] = useState('');
  const [condition, setCondition] = useState('');
  const [coreTemp, setCoreTemp] = useState('');
  const [fishingArea, setFishingArea] = useState('');
  const [fishingMethod, setFishingMethod] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [rejectRatio, setRejectRatio] = useState('');
  const [positions, setPositions] = useState<string[]>(['', '', '', '']);
  const [qc, setQc] = useState<Record<string, string | number | boolean>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  // cold-chain
  const [colorStrap, setColorStrap] = useState('');
  const [colorStrapReused, setColorStrapReused] = useState(false);
  const [holdingLocation, setHoldingLocation] = useState('');
  const [lotBagNo, setLotBagNo] = useState('');
  const [rq, setRq] = useState<RQ>({ egg_bearing: false, discoloration: false, softshell_damage: false, undersized: false, odor: false });

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ label: LabelData; warnings: string[]; pass: boolean; weight: string } | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const sp = species.find((s) => s.code === speciesCode);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuth('no'); return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof as { role?: string | null } | null)?.role ?? null;
      if (!role || !['founder','co_founder','control_admin','manager','processor','receiver','qc_staff'].includes(role)) { setAuth('forbidden'); return; }
      setAuth('ok');
      const [{ data: sps }, { data: vs }] = await Promise.all([
        supabase.from('spinytails_species').select('code, name, grade_set, qc_fields, ccp_limits').eq('active', true).order('name'),
        supabase.from('spinytails_vessels').select('id, vessel_code, vessel_name, fisherman_name, captain_name, fisherman_phone, license_number, color_tag').eq('status', 'approved').order('fisherman_name'),
      ]);
      setSpecies((sps ?? []) as Species[]);
      setVessels((vs ?? []) as Vessel[]);
    })();
  }, []);

  // Default the tie-strap color to the selected vessel's registered color.
  useEffect(() => {
    const v = vessels.find((x) => x.id === vesselId);
    if (v?.color_tag) setColorStrap(v.color_tag);
  }, [vesselId, vessels]);

  // Prefill from a captured document (?doc=…) once species+vessels load.
  useEffect(() => {
    const docId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('doc') : null;
    if (!docId || species.length === 0) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/documents/${docId}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
      const j = await r.json();
      if (!j.ok) return;
      const f = (j.document?.extracted ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof f[k] === 'string' ? f[k] as string : '');
      const prodName = s('product_name') || (Array.isArray(f.products) ? String(f.products[0] ?? '') : s('products'));
      const spMatch = species.find((x) => prodName && x.name.toLowerCase().includes(prodName.toLowerCase()))
        || species.find((x) => s('species') && x.name.toLowerCase().includes(s('species').toLowerCase()));
      if (spMatch) { setSpeciesCode(spMatch.code); setQc({}); setGrade(''); }
      if (prodName) setProductName(prodName);
      const wt = (s('weight') || s('total_weight') || s('total_weight_lbs')).replace(/[^0-9.]/g, '');
      if (wt) setTotalWeight(wt);
      if (s('fishing_area')) setFishingArea(s('fishing_area'));
      if (s('fishing_method')) setFishingMethod(s('fishing_method'));
      if (s('trip_start') || s('trip_start_location')) setTripStart(s('trip_start') || s('trip_start_location'));
      if (s('trip_end') || s('trip_end_location')) setTripEnd(s('trip_end') || s('trip_end_location'));
      const vName = (s('fisherman_name') || s('vessel_owner_name')).toLowerCase();
      const vMatch = (vName && vessels.find((v) => (v.fisherman_name ?? '').toLowerCase().includes(vName)))
        || (s('vessel_name') && vessels.find((v) => (v.vessel_name ?? '').toLowerCase().includes(s('vessel_name').toLowerCase())));
      if (vMatch) setVesselId(vMatch.id);
    })();
  }, [species, vessels]);

  async function capturePhoto(file: File) {
    setBusy(true);
    try {
      const gps = await new Promise<{ lat: number | null; lng: number | null }>((resolve) => {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null });
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve({ lat: null, lng: null }),
          { enableHighAccuracy: true, timeout: 8000 },
        );
      });
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `spinytails-harvest/${speciesCode || 'X'}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('site-images').upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('site-images').getPublicUrl(path);
      setPhotos((prev) => [...prev, { url: data.publicUrl, lat: gps.lat, lng: gps.lng, captured_at: new Date().toISOString() }]);
    } catch (e) {
      setErr(`Photo upload failed: ${e instanceof Error ? e.message : 'try again'}`);
    } finally { setBusy(false); }
  }

  async function submit() {
    setErr(''); setResult(null);
    if (!vesselId) { setErr('Select the approved vessel / supplier.'); return; }
    if (!speciesCode) { setErr('Select the species.'); return; }
    if (!(parseFloat(totalWeight) > 0)) { setErr('Enter total weight.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          vessel_id: vesselId, species_code: speciesCode, product_name: productName,
          num_bags: numBags ? parseInt(numBags, 10) : null,
          total_weight_lbs: parseFloat(totalWeight),
          weight_per_bag_lbs: weightPerBag ? parseFloat(weightPerBag) : null,
          product_state: state, product_grade: grade, product_condition: condition,
          core_temp_f: coreTemp ? parseFloat(coreTemp) : null,
          fishing_area: fishingArea, fishing_method: fishingMethod,
          trip_start_location: tripStart, trip_end_location: tripEnd,
          reject_ratio_pct: rejectRatio ? parseFloat(rejectRatio) : null,
          harvest_positions: positions.map((p) => p.trim()).filter(Boolean),
          qc_results: qc, harvest_photos: photos, device_id: DEVICE_ID,
          // cold-chain
          color_strap: colorStrap || null,
          color_strap_reused: colorStrapReused,
          holding_freezer_location: holdingLocation || null,
          lot_bag_no: lotBagNo || null,
          receiving_qc: rq,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setResult({ label: j.label as LabelData, warnings: j.ccp_warnings ?? [], pass: j.qc_pass, weight: `${totalWeight} lb` });
      // reset the per-lot fields; keep vessel/species/strap for the next bag of the same delivery
      setProductName(''); setNumBags(''); setTotalWeight(''); setWeightPerBag(''); setGrade(''); setCondition('');
      setCoreTemp(''); setQc({}); setPhotos([]); setRejectRatio(''); setPositions(['', '', '', '']);
      setLotBagNo(''); setHoldingLocation(''); setRq({ egg_bearing: false, discoloration: false, softshell_damage: false, undersized: false, odor: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Receiving failed');
    } finally { setBusy(false); }
  }

  function printReceivingLabel(L: LabelData, weight: string) {
    printLabels([{
      title: `RECEIVING · ${L.species}`,
      product_name: L.species,
      batch_number: L.batch_number,
      weight,
      date: new Date(L.receipt_date + 'T00:00:00').toLocaleDateString('en-US'),
      supplier: L.boat,
      extra: [
        { label: 'Captain', value: L.captain },
        { label: 'Reg #', value: L.registration ?? '—' },
        { label: 'Color strap', value: `${L.color_strap}${L.reused ? ' (REUSED)' : ''}` },
        { label: 'Temp', value: L.temp_f != null ? `${L.temp_f}°F` : '—' },
        ...(L.barcode ? [{ label: 'Bag/Barcode', value: L.barcode }] : []),
      ],
    }], { widthIn: 4, heightIn: 6 });
  }

  if (auth === 'checking') return <Center>Checking…</Center>;
  if (auth === 'no') return <Center>Sign in required. <Link href="/staff-login?next=/spinytails/receiving" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></Center>;
  if (auth === 'forbidden') return <Center>Receiving / QC staff only.</Center>;

  const inp: React.CSSProperties = { width: '100%', padding: '14px', fontSize: 16, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6 };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
  const section: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) capturePhoto(f); }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>📥 Receiving Station</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      {result && (
        <div style={{ ...section, border: `2px solid ${result.pass ? '#16a34a' : '#dc2626'}`, background: result.pass ? '#f0fdf4' : '#fef2f2' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#475569' }}>BATCH NUMBER GENERATED</div>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace', color: '#0b1628' }}>{result.label.batch_number}</div>
          <div style={{ fontSize: 13, color: '#0b1628', marginTop: 4 }}>
            🎨 Tie-strap: <b style={{ textTransform: 'capitalize' }}>{result.label.color_strap}</b>{result.label.reused ? ' · ♻ reused from freezer' : ' · new'}
          </div>
          <div style={{ marginTop: 6, fontWeight: 800, color: result.pass ? '#16a34a' : '#dc2626' }}>
            {result.pass ? '✓ CCP-1 within limits — accepted' : '⚠ CCP-1 FAILED — reject/hold + corrective action'}
          </div>
          {result.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: '#b91c1c', marginTop: 4 }}>• {w}</div>)}
          <button
            onClick={() => printReceivingLabel(result.label, result.weight)}
            style={{ marginTop: 12, width: '100%', padding: 14, background: '#0b1628', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 15 }}
          >🖨 Print bin + strap label (batch + QR + barcode + color)</button>
        </div>
      )}

      {/* 1. Supplier */}
      <div style={section}>
        <div style={lbl}>1 · Supplier (approved vessel)</div>
        <select value={vesselId} onChange={(e) => setVesselId(e.target.value)} style={inp}>
          <option value="">— select fisherman / vessel —</option>
          {vessels.map((v) => <option key={v.id} value={v.id}>{v.fisherman_name} · {v.vessel_name ?? v.vessel_code} {v.license_number ? `· Lic ${v.license_number}` : ''}{v.color_tag ? ` · 🎨 ${v.color_tag}` : ''}</option>)}
        </select>
        {vesselId && (() => { const v = vessels.find((x) => x.id === vesselId); return v ? <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>{v.captain_name ? `👤 Capt. ${v.captain_name} · ` : ''}{v.fisherman_phone ? `📞 ${v.fisherman_phone}` : ''}</div> : null; })()}
      </div>

      {/* 2. Product */}
      <div style={section}>
        <div style={lbl}>2 · Product</div>
        <select value={speciesCode} onChange={(e) => { setSpeciesCode(e.target.value); setGrade(''); setQc({}); }} style={inp}>
          <option value="">— select species —</option>
          {species.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
        </select>
        <input placeholder="Product name" value={productName} onChange={(e) => setProductName(e.target.value)} style={inp} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><div style={lbl}># Bags</div><input type="number" inputMode="numeric" value={numBags} onChange={(e) => setNumBags(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Total wt (lb)</div><input type="number" inputMode="decimal" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Wt / bag</div><input type="number" inputMode="decimal" value={weightPerBag} onChange={(e) => setWeightPerBag(e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          {(['fresh', 'frozen'] as const).map((s) => (
            <button key={s} onClick={() => setState(s)} style={{ flex: 1, padding: 14, borderRadius: 10, fontWeight: 800, border: '2px solid', borderColor: state === s ? '#0b1628' : '#cbd5e1', background: state === s ? '#0b1628' : '#fff', color: state === s ? '#fff' : '#0b1628' }}>{s === 'fresh' ? '❄ Fresh Chilled' : '🧊 Frozen'}</button>
          ))}
        </div>
        {sp && sp.grade_set.length > 0 && (
          <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inp}>
            <option value="">— grade —</option>
            {sp.grade_set.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <input placeholder="Product condition" value={condition} onChange={(e) => setCondition(e.target.value)} style={inp} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={lbl}>Temp on arrival (°F)</div><input type="number" inputMode="decimal" value={coreTemp} onChange={(e) => setCoreTemp(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Reject ratio (% / bag)</div><input type="number" inputMode="decimal" value={rejectRatio} onChange={(e) => setRejectRatio(e.target.value)} style={inp} /></div>
        </div>
      </div>

      {/* 3. Tie-strap + storage (cold-chain) */}
      <div style={section}>
        <div style={lbl}>3 · Color tie-strap + storage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={lbl}>Color strap</div>
            <input value={colorStrap} onChange={(e) => setColorStrap(e.target.value)} placeholder="defaults to vessel color" style={{ ...inp, textTransform: 'capitalize' }} />
          </div>
          <div>
            <div style={lbl}>Holding freezer location</div>
            <input value={holdingLocation} onChange={(e) => setHoldingLocation(e.target.value)} placeholder="e.g. Receiving Freezer · Rack 2" style={inp} />
          </div>
        </div>
        <button onClick={() => setColorStrapReused((r) => !r)}
          style={{ width: '100%', marginTop: 10, padding: 12, borderRadius: 10, fontWeight: 800, border: '2px solid', borderColor: colorStrapReused ? '#d97706' : '#cbd5e1', background: colorStrapReused ? '#fef3c7' : '#fff', color: colorStrapReused ? '#b45309' : '#475569', cursor: 'pointer' }}>
          {colorStrapReused ? '♻ REUSING a color strap already in the freezer' : 'New strap (tap if reusing an existing strap)'}
        </button>
        <div style={{ marginTop: 10 }}>
          <div style={lbl}>Bag / barcode (scan with Tera)</div>
          <input value={lotBagNo} onChange={(e) => setLotBagNo(e.target.value)} placeholder="scan or type bag/lot barcode"
            autoComplete="off" style={{ ...inp, fontFamily: 'monospace' }} />
        </div>
      </div>

      {/* 4. Harvest verification */}
      <div style={section}>
        <div style={lbl}>4 · Harvest verification</div>
        <input placeholder="Catch area (e.g. FAO Area 31)" value={fishingArea} onChange={(e) => setFishingArea(e.target.value)} style={inp} />
        <input placeholder="Fishing method" value={fishingMethod} onChange={(e) => setFishingMethod(e.target.value)} style={inp} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input placeholder="Trip start location" value={tripStart} onChange={(e) => setTripStart(e.target.value)} style={inp} />
          <input placeholder="Trip end location" value={tripEnd} onChange={(e) => setTripEnd(e.target.value)} style={inp} />
        </div>
        <div style={lbl}>Harvest positions (3–4 — where the catch was taken)</div>
        {positions.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input placeholder={`Position ${i + 1} (lat, lng or description)`} value={p} onChange={(e) => setPositions((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} style={{ ...inp, marginBottom: 0 }} />
            <button onClick={() => { if (navigator.geolocation) navigator.geolocation.getCurrentPosition((pos) => setPositions((ps) => ps.map((x, j) => (j === i ? `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` : x)))); }} style={{ ...inp, marginBottom: 0, width: 54, flexShrink: 0, background: '#0b1628', color: '#fff', cursor: 'pointer', fontWeight: 800 }} title="Use current GPS">📍</button>
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...inp, background: '#0b1628', color: '#fff', fontWeight: 800, cursor: 'pointer', textAlign: 'center' }}>📷 Capture harvest photo (GPS-tagged)</button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <div key={i} style={{ textAlign: 'center' }}>
              <img src={p.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
              <div style={{ fontSize: 9, color: p.lat != null ? '#16a34a' : '#dc2626' }}>{p.lat != null ? `📍${p.lat.toFixed(3)},${p.lng?.toFixed(3)}` : 'no GPS'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Fisheries receiving QC flags */}
      <div style={section}>
        <div style={lbl}>5 · Receiving QC (Fisheries log) · Y = flag present</div>
        {RQ_FIELDS.map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setRq((s) => ({ ...s, [key]: false }))} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 800, border: '2px solid', borderColor: !rq[key] ? '#16a34a' : '#cbd5e1', background: !rq[key] ? '#16a34a' : '#fff', color: !rq[key] ? '#fff' : '#475569' }}>No</button>
              <button onClick={() => setRq((s) => ({ ...s, [key]: true }))} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 800, border: '2px solid', borderColor: rq[key] ? '#dc2626' : '#cbd5e1', background: rq[key] ? '#dc2626' : '#fff', color: rq[key] ? '#fff' : '#475569' }}>Yes</button>
            </div>
          </div>
        ))}
      </div>

      {/* 6. Receiving inspection (species-aware) */}
      {sp && (
        <div style={section}>
          <div style={lbl}>6 · Receiving inspection (CCP-1) · {sp.name}</div>
          {sp.qc_fields.map((field) => {
            const isNum = field.endsWith('_ppm') || field.endsWith('_f');
            const isBool = field.endsWith('_ok') || field.endsWith('_absent') || field.endsWith('_present') || field.startsWith('adequately');
            const label = field.replace(/_/g, ' ');
            if (isNum) return <div key={field}><div style={lbl}>{label}</div><input type="number" inputMode="decimal" value={String(qc[field] ?? '')} onChange={(e) => setQc((q) => ({ ...q, [field]: e.target.value === '' ? '' : Number(e.target.value) }))} style={inp} /></div>;
            if (isBool) return (
              <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                <button onClick={() => setQc((q) => ({ ...q, [field]: !q[field] }))} style={{ padding: '8px 18px', borderRadius: 8, fontWeight: 800, border: '2px solid', borderColor: qc[field] ? '#16a34a' : '#cbd5e1', background: qc[field] ? '#16a34a' : '#fff', color: qc[field] ? '#fff' : '#475569' }}>{qc[field] ? 'YES ✓' : 'NO'}</button>
              </div>
            );
            return <div key={field}><div style={lbl}>{label}</div><input value={String(qc[field] ?? '')} onChange={(e) => setQc((q) => ({ ...q, [field]: e.target.value }))} style={inp} /></div>;
          })}
        </div>
      )}

      {err && <div style={{ ...section, border: '2px solid #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>⚠ {err}</div>}

      <button onClick={submit} disabled={busy} style={{ width: '100%', padding: 18, fontSize: 18, fontWeight: 900, background: busy ? '#94a3b8' : '#f5c518', color: '#0b1628', border: 'none', borderRadius: 14, cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Working…' : '✓ Receive + generate batch number'}
      </button>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}
