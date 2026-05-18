'use client';

// app/lobster-intake/page.tsx
//
// STEP 1 of the lobster pipeline — boat receive at Spiny Tail door.
// Captures vessel + captain + photos/videos WITH GPS so we have full
// provenance before processing begins. Each intake lands in
// public.yield_lots with approval_status='pending'. Once approved,
// processing picks it up at /dashboard/processing-batches (Steps 2 & 3).
//
// Schema additions live in 20260518040000_intake_step1_step2.sql.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';
import { captureGps, gmapsLink } from '@/lib/traceability/batch';

export const dynamic = 'force-dynamic';

const PRODUCT_TYPES = [
  'Lobster Tail',
  'Lobster Whole',
  'Conch Whole',
  'Conch Cleaned',
  'Snapper Whole',
  'Hog Fish',
  'Grouper Whole',
  'Other',
];

const ISLANDS = [
  'Nassau',
  'Moores Island',
  'Andros',
  'Eleuthera',
  'Exuma',
  'Abaco',
  'Grand Bahama',
  'Long Island',
  'Cat Island',
  'Other',
];

// NOTE: Size grading happens in Step 3 at the processing facility, NOT here.
// Step 1 is for the fisherman/receiver: vessel info + GPS-stamped media +
// raw weight. Grading by 5oz/6oz/.../20UP is what processing operators
// fill in on /dashboard/processing-batches after the batch is finished.

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver']);

type Supplier = {
  id: string;
  name: string;
  vessel_name: string | null;
  vessel_registration_number: string | null;
  vessel_owner_name: string | null;
  vessel_captain_name: string | null;
  vessel_registration_doc_url: string | null;
  vessel_registration_year: number | null;
  vessel_registration_expires_on: string | null;
  vessel_registration_uploaded_at: string | null;
};

type IntakeRow = {
  id: string;
  lot_number: string | null;
  received_date: string | null;
  product_type: string | null;
  source_type: string | null;
  island_source: string | null;
  captain_name: string | null;
  boat_reg: string | null;
  vessel_name: string | null;
  vessel_registration: string | null;
  whole_weight_lb: number | null;
  clean_weight_lb: number | null;
  cost_paid: number | null;
  true_cost_per_lb: number | null;
  size_grade_breakdown: Record<string, number> | null;
  intake_notes: string | null;
  supplier_id: string | null;
  supplier?: Supplier | Supplier[] | null;
  intake_photos: string[] | null;
  intake_videos: string[] | null;
  intake_latitude: number | null;
  intake_longitude: number | null;
  intake_captured_at: string | null;
  approval_status: 'pending' | 'approved' | 'rejected' | null;
  approval_notes: string | null;
  created_at: string;
};

type MediaItem = { url: string; type: 'photo' | 'video'; lat: number | null; lng: number | null; capturedAt: string | null };

export default function LobsterIntakePage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Form state
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [vesselReg, setVesselReg] = useState('');
  const [boatReg, setBoatReg] = useState('');
  const [islandSource, setIslandSource] = useState('Moores Island');
  const [productType, setProductType] = useState('Lobster Tail');
  const [sourceType, setSourceType] = useState<'tail' | 'whole'>('tail');
  const [totalWeight, setTotalWeight] = useState('');
  const [costPerLb, setCostPerLb] = useState('8.00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Step 1 media + GPS
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // Approval workflow
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Yearly boat registration upload (per-supplier)
  const [regUploading, setRegUploading] = useState(false);
  const [regBusy, setRegBusy] = useState(false);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId],
  );

  // When supplier changes, prefill vessel fields from supplier record.
  // Manual overrides (user typed something different) are preserved if
  // they exist before selection.
  useEffect(() => {
    if (!selectedSupplier) return;
    if (selectedSupplier.vessel_captain_name && !captainName) setCaptainName(selectedSupplier.vessel_captain_name);
    if (selectedSupplier.vessel_name             && !vesselName)  setVesselName(selectedSupplier.vessel_name);
    if (selectedSupplier.vessel_registration_number && !vesselReg) setVesselReg(selectedSupplier.vessel_registration_number);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSupplier?.id]);

  const currentYear = new Date().getFullYear();
  const regYear     = selectedSupplier?.vessel_registration_year ?? null;
  const regOnFile   = !!selectedSupplier?.vessel_registration_doc_url;
  const regCurrent  = regOnFile && regYear === currentYear;
  const regExpired  = regOnFile && regYear !== null && regYear < currentYear;

  // Update sourceType automatically when productType changes
  useEffect(() => {
    if (productType === 'Lobster Whole') setSourceType('whole');
    else if (productType === 'Lobster Tail') setSourceType('tail');
  }, [productType]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/lobster-intake'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await Promise.all([load(), loadSuppliers()]);
    })();
  }, []);

  async function loadSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select(`
        id, name,
        vessel_name, vessel_registration_number, vessel_owner_name,
        vessel_captain_name, vessel_registration_doc_url,
        vessel_registration_year, vessel_registration_expires_on,
        vessel_registration_uploaded_at
      `)
      .order('name', { ascending: true });
    setSuppliers((data || []) as Supplier[]);
  }

  async function uploadYearlyRegistration(file: File) {
    if (!selectedSupplier) { alert('Pick a supplier first.'); return; }
    setRegUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `suppliers/${selectedSupplier.id}/registration-${currentYear}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('vendor-listings').upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) { alert(`Upload failed: ${upErr.message}`); setRegUploading(false); return; }
    const { data: pub } = supabase.storage.from('vendor-listings').getPublicUrl(path);
    const { error: updErr } = await supabase.from('suppliers').update({
      vessel_registration_doc_url:     pub.publicUrl,
      vessel_registration_year:        currentYear,
      vessel_registration_uploaded_at: new Date().toISOString(),
      vessel_registration_uploaded_by: user?.id ?? null,
      // also fold in any edits the operator made to vessel info while here
      vessel_captain_name:        captainName.trim() || selectedSupplier.vessel_captain_name,
      vessel_name:                vesselName.trim()  || selectedSupplier.vessel_name,
      vessel_registration_number: vesselReg.trim()   || selectedSupplier.vessel_registration_number,
    }).eq('id', selectedSupplier.id);
    setRegUploading(false);
    if (updErr) { alert(`Save failed: ${plainError(updErr)}`); return; }
    await loadSuppliers();
  }

  async function saveVesselToSupplier() {
    if (!selectedSupplier) return;
    setRegBusy(true);
    const { error: err } = await supabase.from('suppliers').update({
      vessel_captain_name:        captainName.trim() || null,
      vessel_name:                vesselName.trim()  || null,
      vessel_registration_number: vesselReg.trim()   || null,
    }).eq('id', selectedSupplier.id);
    setRegBusy(false);
    if (err) { alert(`Save failed: ${plainError(err)}`); return; }
    await loadSuppliers();
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('yield_lots')
      .select(`
        id, lot_number, received_date, product_type, source_type,
        island_source, captain_name, boat_reg, vessel_name, vessel_registration,
        whole_weight_lb, clean_weight_lb, cost_paid, true_cost_per_lb,
        size_grade_breakdown, intake_notes, supplier_id, created_at,
        intake_photos, intake_videos, intake_latitude, intake_longitude,
        intake_captured_at, approval_status, approval_notes,
        supplier:suppliers ( id, name )
      `)
      .order('received_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) {
      setError(plainError(err));
      setIntakes([]);
    } else {
      const normalized = ((data || []) as Array<IntakeRow>).map((r) => ({
        ...r,
        supplier: Array.isArray(r.supplier) ? r.supplier[0] ?? null : r.supplier,
      }));
      setIntakes(normalized);
    }
    setLoading(false);
  }

  function totalCost() {
    const w = Number(totalWeight);
    const c = Number(costPerLb);
    if (!Number.isFinite(w) || !Number.isFinite(c)) return 0;
    return Math.round(w * c * 100) / 100;
  }

  async function uploadMedia(file: File) {
    if (!file) return;
    setUploading(true);
    const isVideo = file.type.startsWith('video/');
    const gpsP = captureGps();
    const { data: { user } } = await supabase.auth.getUser();
    const ext  = file.name.split('.').pop() ?? (isVideo ? 'mp4' : 'jpg');
    const path = `${user?.id ?? 'anon'}/intake/${receivedDate}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('vendor-listings').upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { alert(`Upload failed: ${upErr.message}`); setUploading(false); return; }
    const { data: pub } = supabase.storage.from('vendor-listings').getPublicUrl(path);
    const gps = await gpsP;
    setMedia((m) => [...m, {
      url: pub.publicUrl,
      type: isVideo ? 'video' : 'photo',
      lat: gps?.latitude ?? null,
      lng: gps?.longitude ?? null,
      capturedAt: gps?.captured_at ?? new Date().toISOString(),
    }]);
    setUploading(false);
  }

  function removeMedia(idx: number) {
    setMedia((m) => m.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(null);
    if (!totalWeight || Number(totalWeight) <= 0) { alert('Enter a weight'); return; }
    if (!costPerLb || Number(costPerLb) <= 0) { alert('Enter a cost per lb'); return; }
    if (!supplierId && !captainName.trim()) { alert('Pick a supplier or enter a captain name'); return; }
    if (media.length === 0) {
      if (!confirm('No photos/videos uploaded. Step 1 normally requires GPS-stamped media. Save anyway?')) return;
    }
    setSubmitting(true);

    const lotNumber = `${islandSource.slice(0, 3).toUpperCase()}-${productType.replace(/\s+/g, '-').slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-8)}`;

    const weight = Number(totalWeight);
    const cost = Number(costPerLb);
    const totalDollars = weight * cost;

    // Use first photo's GPS as canonical intake position
    const primary = media.find((m) => m.lat != null && m.lng != null) ?? null;

    const row: Record<string, unknown> = {
      received_date: receivedDate,
      product_type: productType,
      source_type: sourceType,
      island_source: islandSource,
      captain_name: captainName.trim() || null,
      vessel_name: vesselName.trim() || null,
      vessel_registration: vesselReg.trim() || null,
      boat_reg: boatReg.trim() || vesselReg.trim() || null,
      cost_paid: totalDollars,
      true_cost_per_lb: cost,
      intake_notes: notes.trim() || null,
      supplier_id: supplierId || null,
      lot_number: lotNumber,
      intake_photos: media.filter((m) => m.type === 'photo').map((m) => m.url),
      intake_videos: media.filter((m) => m.type === 'video').map((m) => m.url),
      intake_latitude:  primary?.lat ?? null,
      intake_longitude: primary?.lng ?? null,
      intake_captured_at: primary?.capturedAt ?? null,
      approval_status: 'pending',
    };
    if (sourceType === 'whole') row.whole_weight_lb = weight;
    else row.clean_weight_lb = weight;

    const { error: err } = await supabase.from('yield_lots').insert(row);
    setSubmitting(false);
    if (err) {
      alert(`Save failed: ${plainError(err)}\n\nIf 'relation' or 'column' error, run sql/2026-05-09-lobster-intake.sql + 20260518040000_intake_step1_step2.sql in Supabase.`);
      return;
    }

    setSuccess(`✓ Lot ${lotNumber} saved · ${weight} lbs · BSD $${totalDollars.toFixed(2)} · awaiting approval`);
    setCaptainName('');
    setVesselName('');
    setVesselReg('');
    setBoatReg('');
    setTotalWeight('');
    setNotes('');
    setMedia([]);
    load();
  }

  async function approve(id: string, status: 'approved' | 'rejected') {
    setApprovingId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const noteText = status === 'rejected'
      ? prompt('Reason for rejecting this intake?') || 'rejected'
      : null;
    const { error: err } = await supabase.from('yield_lots').update({
      approval_status: status,
      approved_by: session?.user.id ?? null,
      approved_at: new Date().toISOString(),
      approval_notes: noteText,
    }).eq('id', id);
    setApprovingId(null);
    if (err) { alert(`Failed: ${plainError(err)}`); return; }
    await load();
  }

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todays = intakes.filter((r) => r.received_date === today);
    let lbs = 0;
    let cost = 0;
    for (const r of todays) {
      lbs += Number(r.whole_weight_lb || r.clean_weight_lb || 0);
      cost += Number(r.cost_paid || 0);
    }
    const pending = intakes.filter((r) => r.approval_status === 'pending').length;
    return { count: todays.length, lbs: Math.round(lbs * 10) / 10, cost: Math.round(cost * 100) / 100, pending };
  }, [intakes]);

  if (authed === null) return <div style={pgStyle}>Loading…</div>;

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Step 1 · Lobster Intake
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Boat receive at Spiny Tail door. Capture vessel + GPS-stamped photos/videos. Lot # auto-generates. Once approved, the lot routes to processing for Step 2 (freezer + production date) and Step 3 (case packing + rejections).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Stat label="Today's intakes" value={todayStats.count}                accent="#f5c518" />
        <Stat label="Today's lbs"     value={`${todayStats.lbs.toFixed(1)}`} accent="#22c55e" />
        <Stat label="Today's cost"    value={`$${todayStats.cost.toFixed(2)}`} accent="#a78bfa" />
        <Stat label="Pending approval" value={todayStats.pending}             accent="#fbbf24" />
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginBottom: 12 }}>
          ⚠️ {error}
          {(error.toLowerCase().includes('relation') || error.toLowerCase().includes('column')) && (
            <div style={{ marginTop: 6 }}>Run the latest migration <code>20260518040000_intake_step1_step2.sql</code> in Supabase SQL editor.</div>
          )}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, color: '#22c55e', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {success}
        </div>
      )}

      <form onSubmit={submit} style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 10 }}>+ New intake</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Date received">
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} style={inputStyle} required />
          </Field>
          <Field label="Source island">
            <select value={islandSource} onChange={(e) => setIslandSource(e.target.value)} style={inputStyle}>
              {ISLANDS.map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Supplier (existing fisherman)">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
            <option value="">— none / new fisherman below —</option>
            {suppliers.map((s) => {
              const tag = s.vessel_registration_year === currentYear
                ? '✓'
                : s.vessel_registration_doc_url ? `⚠ ${s.vessel_registration_year ?? '?'}` : '⚠ no reg';
              return <option key={s.id} value={s.id}>{s.name} · {tag}</option>;
            })}
          </select>
        </Field>

        {/* Yearly boat registration — uploaded once per government renewal year */}
        {selectedSupplier && (
          <div style={{
            background: regCurrent ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${regCurrent ? '#22c55e' : '#f87171'}`,
            borderRadius: 8, padding: 10, marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: regCurrent ? '#22c55e' : '#f87171', textTransform: 'uppercase' }}>
                  📜 Yearly boat registration · {selectedSupplier.name}
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  {regCurrent && <>✓ {currentYear} registration on file · uploaded {selectedSupplier.vessel_registration_uploaded_at ? new Date(selectedSupplier.vessel_registration_uploaded_at).toLocaleDateString() : '—'}</>}
                  {regExpired && <>⚠ Latest doc is for {regYear}. Upload {currentYear} renewal.</>}
                  {!regOnFile && <>⚠ No boat registration on file. Upload the {currentYear} government renewal.</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {selectedSupplier.vessel_registration_doc_url && (
                  <a href={selectedSupplier.vessel_registration_doc_url} target="_blank" rel="noopener noreferrer"
                    style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                    📄 View on file
                  </a>
                )}
                <label style={{
                  background: regCurrent ? 'rgba(34,197,94,0.15)' : '#f5c518',
                  color: regCurrent ? '#22c55e' : '#060d1f',
                  border: `1px solid ${regCurrent ? '#22c55e' : '#f5c518'}`,
                  borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 800,
                  cursor: regUploading ? 'not-allowed' : 'pointer', opacity: regUploading ? 0.5 : 1,
                }}>
                  {regUploading ? '⏳ Uploading…' : regCurrent ? `🔁 Replace ${currentYear}` : `📤 Upload ${currentYear} renewal`}
                  <input type="file" accept="image/*,application/pdf" disabled={regUploading} style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadYearlyRegistration(f); e.currentTarget.value = ''; }} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Vessel block — auto-fills from supplier record on selection */}
        <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518' }}>
              Vessel & Captain {selectedSupplier ? <span style={{ color: '#94a3b8', fontWeight: 400 }}>· auto-filled from {selectedSupplier.name}</span> : null}
            </div>
            {selectedSupplier && (
              <button type="button" onClick={saveVesselToSupplier} disabled={regBusy}
                style={{ background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: regBusy ? 'not-allowed' : 'pointer' }}>
                {regBusy ? '…' : '💾 Save to supplier'}
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Captain name">
              <input value={captainName} onChange={(e) => setCaptainName(e.target.value)} placeholder="e.g. Oscar Pinder" style={inputStyle} />
            </Field>
            <Field label="Boat name">
              <input value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="e.g. Sea Hunter" style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Boat registration #">
              <input value={vesselReg} onChange={(e) => setVesselReg(e.target.value)} placeholder="BAH-12345" style={inputStyle} />
            </Field>
            <Field label="Other reg (legacy)">
              <input value={boatReg} onChange={(e) => setBoatReg(e.target.value)} placeholder="optional" style={inputStyle} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Product type">
            <select value={productType} onChange={(e) => setProductType(e.target.value)} style={inputStyle}>
              {PRODUCT_TYPES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Source type">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as 'tail' | 'whole')} style={inputStyle}>
              <option value="tail">Tail (already separated by fisherman)</option>
              <option value="whole">Whole (process at Spiny Tail)</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Field label="Total weight (lbs)">
            <input type="number" step="0.01" min="0" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} placeholder="0.00" style={inputStyle} required />
          </Field>
          <Field label="Cost per lb (BSD)">
            <input type="number" step="0.01" min="0" value={costPerLb} onChange={(e) => setCostPerLb(e.target.value)} style={inputStyle} required />
          </Field>
          <Field label="Total cost (auto)">
            <input type="text" value={`$${totalCost().toFixed(2)}`} readOnly style={{ ...inputStyle, background: '#0a1628', color: '#22c55e', fontWeight: 800 }} />
          </Field>
        </div>

        {/* Size grading lives at /dashboard/processing-batches Step 3 — not here. */}

        {/* GPS-stamped media uploads — required for traceability */}
        <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', marginBottom: 6 }}>
            📸 Intake photos / videos (GPS-stamped) — required for traceability
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={uploadBtn(uploading)}>
              {uploading ? '⏳ Uploading…' : '📷 Take photo'}
              <input type="file" accept="image/*" capture="environment" disabled={uploading} style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.currentTarget.value = ''; }} />
            </label>
            <label style={uploadBtn(uploading)}>
              {uploading ? '⏳ Uploading…' : '🎥 Record video'}
              <input type="file" accept="video/*" capture="environment" disabled={uploading} style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.currentTarget.value = ''; }} />
            </label>
            <label style={uploadBtn(uploading)}>
              {uploading ? '⏳ Uploading…' : '🗂 Upload from device'}
              <input type="file" accept="image/*,video/*" multiple disabled={uploading} style={{ display: 'none' }}
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  for (const f of files) { await uploadMedia(f); }
                  e.currentTarget.value = '';
                }} />
            </label>
          </div>
          {media.length === 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              No media yet. Take at least one photo so GPS gets stamped.
            </div>
          )}
          {media.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {media.map((m, i) => (
                <div key={i} style={{ background: '#060d1f', border: '1px solid #1e3a5f', borderRadius: 8, padding: 6, position: 'relative' }}>
                  {m.type === 'photo' ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.url} alt={`upload ${i + 1}`} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <video src={m.url} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} />
                  )}
                  <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 4 }}>
                    {m.lat != null && m.lng != null ? (
                      <a href={gmapsLink(m.lat, m.lng) ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>📍 GPS</a>
                    ) : (
                      <span style={{ color: '#f87171' }}>⚠ no GPS</span>
                    )}
                  </div>
                  <button type="button" onClick={() => removeMedia(i)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(248,113,113,0.9)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 9, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="condition, payment terms, anything to remember" style={inputStyle} />
        </Field>

        <button
          type="submit"
          disabled={submitting || uploading}
          style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '12px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: (submitting || uploading) ? 0.5 : 1 }}
        >
          {submitting ? 'Saving…' : 'Save intake + send for approval'}
        </button>
      </form>

      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 6 }}>
        Recent intakes
      </div>

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && intakes.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center' }}>
          No intakes yet.
        </div>
      )}

      {intakes.map((r) => {
        const lbs = Number(r.whole_weight_lb || r.clean_weight_lb || 0);
        const sup = r.supplier as Supplier | null;
        const status = r.approval_status ?? 'pending';
        const accent = status === 'approved' ? '#22c55e' : status === 'rejected' ? '#f87171' : '#fbbf24';
        const photoCount = (r.intake_photos ?? []).length;
        const videoCount = (r.intake_videos ?? []).length;
        const map = gmapsLink(r.intake_latitude, r.intake_longitude);
        return (
          <div key={r.id} style={{ ...cardStyle, borderLeft: `4px solid ${accent}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  {r.product_type} · {lbs.toFixed(1)} lbs
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Lot <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{r.lot_number || '—'}</span>
                  {r.island_source && ` · ${r.island_source}`}
                  {(r.vessel_name || r.captain_name) && ` · ${r.vessel_name ?? ''}${r.captain_name ? ` (${r.captain_name})` : ''}`}
                  {r.vessel_registration && ` · reg ${r.vessel_registration}`}
                  {sup && ` · ${sup.name}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ background: `${accent}22`, color: accent, padding: '3px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{status}</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', marginTop: 4 }}>${Number(r.cost_paid || 0).toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>${Number(r.true_cost_per_lb || 0).toFixed(2)}/lb</div>
              </div>
            </div>

            {(photoCount + videoCount > 0 || map) && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #1e3a5f', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {photoCount > 0 && <span>📷 {photoCount} photo{photoCount === 1 ? '' : 's'}</span>}
                {videoCount > 0 && <span>🎥 {videoCount} video{videoCount === 1 ? '' : 's'}</span>}
                {map && <a href={map} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>📍 GPS map</a>}
              </div>
            )}

            {r.intake_notes && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, fontStyle: 'italic' }}>
                {r.intake_notes}
              </div>
            )}
            {r.approval_notes && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 6, fontStyle: 'italic' }}>
                Rejection: {r.approval_notes}
              </div>
            )}

            {status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => approve(r.id, 'approved')} disabled={approvingId === r.id} style={{ ...btn, background: '#16a34a' }}>
                  {approvingId === r.id ? '…' : '✓ Approve → send to processing'}
                </button>
                <button onClick={() => approve(r.id, 'rejected')} disabled={approvingId === r.id} style={{ ...btn, background: '#dc2626' }}>
                  ✗ Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

const uploadBtn = (busy: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  background: '#1e3a5f', color: '#f5c518', border: '1px solid #f5c518',
  borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700,
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
});

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
const btn: React.CSSProperties = { flex: 1, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
