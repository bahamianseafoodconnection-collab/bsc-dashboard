'use client';

// /dashboard/processing-batches — Spiny Tail processing facility view.
//
//   Step 1 lives in /lobster-intake (vessel + GPS-stamped media).
//   Step 2 (this page): freezer assignment, raw → finished weight,
//          production date stamps expiry, gross rejected weight.
//   Step 3 (this page): per-size case packing (10lb + 40lb master case
//          counts) + line-item rejections with notes. Stage 3 stays
//          editable after the batch is marked processed because pack
//          counts often get adjusted on the line.
//
// All three steps share one record in traceability_batches. The card
// header always shows the upstream traceability summary (vessel, boat
// reg, batch #, GPS-stamped phase media) so the operator has the full
// chain of custody in view while packing.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { gmapsLink } from '@/lib/traceability/batch';

const QC_ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver']);

// Lobster ladder: matches Step 1 + label flow (5oz → 20UP).
const LOBSTER_SIZES = ['5oz','6oz','7oz','8oz','9oz','10/12oz','12/14oz','14/16oz','16/20oz','20UP'];

interface CaseCount { ten_lb: number; forty_lb: number; }
type CaseBreakdown = Record<string, CaseCount>;
interface RejectionItem { size: string; weight_lbs: number; reason: string; }

interface BatchRow {
  id: string; batch_number: string; lot_code: string | null; listing_id: string; vendor_id: string; vendor_type: string;
  product_name: string; scientific_name: string | null;
  quantity_units: number | null; quantity_unit_type: string | null;
  raw_weight_lbs: number | null;
  vendor_payout_snapshot: number | null;
  finished_boxes: number | null; finished_weight_lbs: number | null;
  yield_pct: number | null; product_cost_per_lb: number | null;
  vessel_name: string | null; vessel_registration: string | null; captain_name: string | null;
  vessel_owner_name: string | null; vessel_registration_doc_url: string | null;
  farm_name: string | null; farm_license_number: string | null; farm_license_doc_url: string | null;
  farmer_id_doc_url: string | null;
  status: 'pending_processing' | 'at_processing' | 'processed' | 'rejected';
  shelf_life_days: number | null; production_date: string | null; expiry_date: string | null;
  approved_at: string | null; sent_to_processing_at: string | null; processed_at: string | null;
  processing_notes: string | null; final_qc_notes: string | null;
  freezer_position: string | null; rejected_weight_lbs: number | null;
  case_size_breakdown: CaseBreakdown | null;
  rejection_items: RejectionItem[] | null;
  rejection_notes: string | null;
}
interface VendorMini   { id: string; business_name: string; phone: string | null; }
interface ListingMini  { id: string; title: string; unit: string; quantity_available: number; }
interface PhaseRow     { id: string; listing_id: string; phase_number: number; phase_label: string; media_type: 'photo' | 'video'; media_url: string; latitude: number | null; longitude: number | null; captured_at: string | null; }

export default function ProcessingBatchesPage() {
  const [batches,  setBatches]  = useState<BatchRow[]>([]);
  const [vendors,  setVendors]  = useState<Record<string, VendorMini>>({});
  const [listings, setListings] = useState<Record<string, ListingMini>>({});
  const [phases,   setPhases]   = useState<Record<string, PhaseRow[]>>({});
  const [search,   setSearch]   = useState('');
  const [authed,   setAuthed]   = useState<boolean | null>(null);
  const [loading,  setLoading]  = useState(true);

  const [edits, setEdits] = useState<Record<string, Partial<BatchRow>>>({});
  const [busy,  setBusy]  = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/processing-batches'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !QC_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const { data } = await supabase.from('traceability_batches')
      .select('*').in('status', ['pending_processing','at_processing','processed']).order('approved_at', { ascending: false }).limit(120);
    const list = (data ?? []) as BatchRow[];
    setBatches(list);
    if (list.length === 0) return;
    const vids = Array.from(new Set(list.map((b) => b.vendor_id)));
    const lids = Array.from(new Set(list.map((b) => b.listing_id)));
    const [{ data: vs }, { data: ls }, { data: ps }] = await Promise.all([
      supabase.from('vendors').select('id, business_name, phone').in('id', vids),
      supabase.from('vendor_listings').select('id, title, unit, quantity_available').in('id', lids),
      supabase.from('traceability_phases').select('*').in('listing_id', lids),
    ]);
    const vm: Record<string, VendorMini>  = {}; for (const v of (vs ?? []) as VendorMini[])  vm[v.id] = v;
    const lm: Record<string, ListingMini> = {}; for (const l of (ls ?? []) as ListingMini[]) lm[l.id] = l;
    const pm: Record<string, PhaseRow[]>  = {}; for (const p of (ps ?? []) as PhaseRow[]) (pm[p.listing_id] ||= []).push(p);
    for (const k of Object.keys(pm)) pm[k].sort((a, b) => a.phase_number - b.phase_number);
    setVendors(vm); setListings(lm); setPhases(pm);
  }

  function patch(id: string, p: Partial<BatchRow>) {
    setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? {}), ...p } }));
  }

  function effective<K extends keyof BatchRow>(b: BatchRow, key: K): BatchRow[K] {
    const e = edits[b.id] as Partial<BatchRow> | undefined;
    return (e && key in e ? (e[key] as BatchRow[K]) : b[key]);
  }

  function caseBreakdown(b: BatchRow): CaseBreakdown {
    return (effective(b, 'case_size_breakdown') as CaseBreakdown | null) ?? {};
  }

  function rejectionItems(b: BatchRow): RejectionItem[] {
    return (effective(b, 'rejection_items') as RejectionItem[] | null) ?? [];
  }

  function setCase(b: BatchRow, size: string, field: keyof CaseCount, val: number) {
    const cur = caseBreakdown(b);
    const row = { ten_lb: cur[size]?.ten_lb ?? 0, forty_lb: cur[size]?.forty_lb ?? 0, [field]: val };
    patch(b.id, { case_size_breakdown: { ...cur, [size]: row } });
  }

  function addRejection(b: BatchRow) {
    const items = rejectionItems(b);
    patch(b.id, { rejection_items: [...items, { size: LOBSTER_SIZES[0], weight_lbs: 0, reason: '' }] });
  }

  function updateRejection(b: BatchRow, idx: number, p: Partial<RejectionItem>) {
    const items = rejectionItems(b);
    const next = items.map((it, i) => i === idx ? { ...it, ...p } : it);
    patch(b.id, { rejection_items: next });
  }

  function removeRejection(b: BatchRow, idx: number) {
    const items = rejectionItems(b);
    patch(b.id, { rejection_items: items.filter((_, i) => i !== idx) });
  }

  async function startProcessing(b: BatchRow) {
    setBusy(b.id);
    const raw_weight_lbs = Number(effective(b, 'raw_weight_lbs') ?? 0);
    const freezer_position = String(effective(b, 'freezer_position') ?? '').trim();
    if (!raw_weight_lbs || raw_weight_lbs <= 0) { alert('Record raw weight first.'); setBusy(null); return; }
    if (!freezer_position) { alert('Assign a freezer position before starting (Step 2).'); setBusy(null); return; }
    await supabase.from('traceability_batches').update({
      raw_weight_lbs,
      freezer_position,
      status: 'at_processing',
    }).eq('id', b.id);
    setBusy(null);
    setEdits((e) => { const cp = { ...e }; delete cp[b.id]; return cp; });
    await load();
  }

  async function finishProcessing(b: BatchRow) {
    setBusy(b.id);
    const { data: { session } } = await supabase.auth.getSession();
    const finished_weight_lbs = Number(effective(b, 'finished_weight_lbs') ?? 0);
    const finished_boxes      = Number(effective(b, 'finished_boxes')      ?? 0);
    const production_date     = String(effective(b, 'production_date') ?? new Date().toISOString().slice(0, 10));
    const rejected_weight_lbs = Number(effective(b, 'rejected_weight_lbs') ?? 0) || null;
    const case_size_breakdown = effective(b, 'case_size_breakdown') ?? null;
    const rejection_items     = effective(b, 'rejection_items')     ?? null;
    const rejection_notes     = String(effective(b, 'rejection_notes') ?? '').trim() || null;
    if (!finished_weight_lbs || finished_weight_lbs <= 0) { alert('Finished weight required.'); setBusy(null); return; }
    await supabase.from('traceability_batches').update({
      finished_boxes:        finished_boxes || null,
      finished_weight_lbs,
      production_date,
      final_qc_notes:        effective(b, 'final_qc_notes')        ?? null,
      freezer_position:      effective(b, 'freezer_position')      ?? null,
      rejected_weight_lbs,
      case_size_breakdown,
      rejection_items,
      rejection_notes,
      processing_operator_id: session?.user.id ?? null,
      status:                'processed',
      processed_at:          new Date().toISOString(),
    }).eq('id', b.id);
    setBusy(null);
    setEdits((e) => { const cp = { ...e }; delete cp[b.id]; return cp; });
    await load();
  }

  async function saveStage3(b: BatchRow) {
    setBusy(b.id);
    await supabase.from('traceability_batches').update({
      case_size_breakdown: effective(b, 'case_size_breakdown') ?? null,
      rejection_items:     effective(b, 'rejection_items')     ?? null,
      rejection_notes:     String(effective(b, 'rejection_notes') ?? '').trim() || null,
      rejected_weight_lbs: Number(effective(b, 'rejected_weight_lbs') ?? 0) || null,
    }).eq('id', b.id);
    setBusy(null);
    setEdits((e) => { const cp = { ...e }; delete cp[b.id]; return cp; });
    await load();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.toLowerCase();
    return batches.filter((b) =>
      b.batch_number.toLowerCase().includes(q) ||
      (b.lot_code ?? '').toLowerCase().includes(q) ||
      b.product_name.toLowerCase().includes(q) ||
      (vendors[b.vendor_id]?.business_name ?? '').toLowerCase().includes(q)
    );
  }, [batches, search, vendors]);

  if (authed === null) return <div style={pg}>Loading…</div>;
  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>🏭 Spiny Tail Processing — incoming batches</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {batches.length} batch{batches.length === 1 ? '' : 'es'} in flight · Step 2 = freezer + production · Step 3 = case packing + rejections
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batch #, lot code, product, vendor…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, marginBottom: 12 }} />
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No batches in flight 🎉</div>}

        {filtered.map((b) => {
          const v   = vendors[b.vendor_id];
          const lst = listings[b.listing_id];
          const ps  = phases[b.listing_id] ?? [];
          const stage1 = b.status === 'pending_processing';
          const stage2 = b.status === 'at_processing';
          const stage3Editable = stage2 || b.status === 'processed';
          const cb = caseBreakdown(b);
          const ri = rejectionItems(b);
          const caseTotals = sumCases(cb);
          return (
            <article key={b.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#f5c518', fontWeight: 700 }}>
                    {b.batch_number}{b.lot_code ? <span style={{ color: '#94a3b8', marginLeft: 8 }}>· lot {b.lot_code}</span> : null}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{b.product_name}{b.scientific_name ? ` (${b.scientific_name})` : ''}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {v?.business_name ?? 'Vendor'} · {b.vendor_type}{lst ? ` · ${Number(lst.quantity_available).toFixed(0)} ${lst.unit}` : ''}
                    {b.quantity_units ? ` · ${b.quantity_units} ${b.quantity_unit_type ?? 'bag'}${b.quantity_units === 1 ? '' : 's'} in` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <span style={{ background: stage1 ? 'rgba(245,197,24,0.2)' : stage2 ? 'rgba(96,165,250,0.2)' : 'rgba(22,163,74,0.2)', color: stage1 ? '#f5c518' : stage2 ? '#60a5fa' : '#4ade80', padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{b.status.replace(/_/g, ' ')}</span>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>shelf life {b.shelf_life_days ?? '—'}d</div>
                  {b.freezer_position && (
                    <div style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'monospace' }}>🧊 {b.freezer_position}</div>
                  )}
                  {b.status === 'processed' && (
                    <Link href={`/dashboard/processing-batches/${b.id}/labels`} style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 8, background: '#f5c518', color: '#060d1f', fontWeight: 800, fontSize: 11, textDecoration: 'none' }}>
                      🖨 Print labels
                    </Link>
                  )}
                </div>
              </div>

              {/* Stage tracker — arrow points to the next step in the pipeline */}
              <StageTracker
                steps={[
                  { label: '① Intake', state: 'done' },
                  { label: '② Freezer / Production', state: stage1 ? 'next' : stage2 ? 'active' : 'done' },
                  { label: '③ Case packing + rejections', state: stage1 ? 'pending' : stage2 ? 'next' : b.case_size_breakdown ? 'done' : 'active' },
                  { label: '🖨 Labels',  state: b.status === 'processed' ? 'next' : 'pending' },
                ]}
              />

              {/* vessel / farm context — always visible (the "full information" Step 3 needs) */}
              <div style={{ marginTop: 10, padding: 10, background: '#0b1628', borderRadius: 8, fontSize: 11 }}>
                <p style={lab}>{b.vendor_type === 'fisherman' ? 'Vessel' : b.vendor_type === 'farmer' ? 'Farm' : 'Vendor'} context</p>
                {b.vendor_type === 'fisherman' && (
                  <>
                    <Row k="Vessel"       v={b.vessel_name        || '—'} />
                    <Row k="Registration" v={b.vessel_registration || '—'} />
                    <Row k="Captain"      v={b.captain_name        || '—'} />
                    <Row k="Owner"        v={b.vessel_owner_name   || '—'} />
                    {b.vessel_registration_doc_url && <a href={b.vessel_registration_doc_url} target="_blank" rel="noopener noreferrer" style={chip}>📄 Boat registration</a>}
                  </>
                )}
                {b.vendor_type === 'farmer' && (
                  <>
                    <Row k="Farm"          v={b.farm_name           || '—'} />
                    <Row k="License #"     v={b.farm_license_number || '—'} />
                    {b.farm_license_doc_url && <a href={b.farm_license_doc_url} target="_blank" rel="noopener noreferrer" style={chip}>📄 Farm license</a>}
                    {b.farmer_id_doc_url    && <a href={b.farmer_id_doc_url}    target="_blank" rel="noopener noreferrer" style={chip}>🆔 Farmer ID</a>}
                  </>
                )}
              </div>

              {/* traceability phases — pictures + GPS locations from Step 1 */}
              <div style={{ marginTop: 10, padding: 10, background: '#0b1628', borderRadius: 8 }}>
                <p style={lab}>Step 1 traceability — pictures + GPS</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 6 }}>
                  {[1, 2, 3].map((n) => {
                    const p = ps.find((x) => x.phase_number === n);
                    if (!p) return <div key={n} style={{ padding: 8, background: 'rgba(220,38,38,0.1)', color: '#f87171', borderRadius: 6, fontSize: 11 }}>Phase {n}: missing</div>;
                    const map = gmapsLink(p.latitude, p.longitude);
                    return (
                      <div key={n} style={{ padding: 8, background: 'rgba(22,163,74,0.1)', borderRadius: 6, fontSize: 11 }}>
                        <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>Phase {n}: {p.phase_label.replace(/_/g,' ')}</div>
                        <a href={p.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#f5c518' }}>{p.media_type === 'video' ? '🎥' : '📷'} open</a>
                        {map && <> · <a href={map} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>📍 GPS</a></>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stage 1 — pending_processing: receive at door */}
              {stage1 && (
                <div style={{ marginTop: 12, padding: 12, background: '#1a2e5a', borderRadius: 10 }}>
                  <p style={lab}>Step 2a · Intake — record raw weight + assign freezer slot</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={miniLab}>Raw weight (lbs)</label>
                      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="lbs in"
                        value={effective(b, 'raw_weight_lbs') ?? ''}
                        onChange={(ev) => patch(b.id, { raw_weight_lbs: Number(ev.target.value) })}
                        style={inp} />
                    </div>
                    <div>
                      <label style={miniLab}>Freezer position</label>
                      <input type="text" placeholder="e.g. A-3-2 (row-shelf-slot)"
                        value={(effective(b, 'freezer_position') as string | null) ?? ''}
                        onChange={(ev) => patch(b.id, { freezer_position: ev.target.value })}
                        style={inp} />
                    </div>
                  </div>
                  <button onClick={() => startProcessing(b)} disabled={busy === b.id} style={{ ...act, background: '#16a34a', marginTop: 8 }}>
                    {busy === b.id ? 'Saving…' : 'Start processing'}
                  </button>
                </div>
              )}

              {/* Stage 2 — at_processing: finish + Stage 3 (case packing + rejections) */}
              {stage2 && (
                <div style={{ marginTop: 12, padding: 12, background: '#1a2e5a', borderRadius: 10 }}>
                  <p style={lab}>Step 2b · Finish — production date stamps expiry, finished weight stamps yield + cost</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={miniLab}>Finished boxes</label>
                      <input type="number" inputMode="numeric" min="0" placeholder="count"
                        value={(effective(b, 'finished_boxes') as number | null) ?? ''}
                        onChange={(ev) => patch(b.id, { finished_boxes: Number(ev.target.value) })}
                        style={inp} />
                    </div>
                    <div>
                      <label style={miniLab}>Finished weight (lbs) *</label>
                      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="lbs"
                        value={(effective(b, 'finished_weight_lbs') as number | null) ?? ''}
                        onChange={(ev) => patch(b.id, { finished_weight_lbs: Number(ev.target.value) })}
                        style={inp} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div>
                      <label style={miniLab}>Production date</label>
                      <input type="date" value={(effective(b, 'production_date') as string | null) ?? new Date().toISOString().slice(0,10)}
                        onChange={(ev) => patch(b.id, { production_date: ev.target.value })}
                        style={inp} />
                    </div>
                    <div>
                      <label style={miniLab}>Freezer position</label>
                      <input type="text" placeholder="A-3-2"
                        value={(effective(b, 'freezer_position') as string | null) ?? ''}
                        onChange={(ev) => patch(b.id, { freezer_position: ev.target.value })}
                        style={inp} />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={miniLab}>Final QC notes</label>
                    <textarea rows={2} value={(effective(b, 'final_qc_notes') as string | null) ?? ''}
                      onChange={(ev) => patch(b.id, { final_qc_notes: ev.target.value })}
                      style={{ ...inp, fontFamily: 'inherit' }} placeholder="Quality, temperature, any issues…" />
                  </div>

                  <LiveMath
                    raw_weight_lbs={Number(effective(b, 'raw_weight_lbs') ?? 0)}
                    finished_weight_lbs={Number(effective(b, 'finished_weight_lbs') ?? 0)}
                    payout_snapshot={Number(b.vendor_payout_snapshot ?? 0)}
                    production_date={(effective(b, 'production_date') as string | null) ?? ''}
                    shelf_life_days={Number(b.shelf_life_days ?? 0)}
                  />
                </div>
              )}

              {/* Stage 3 — case packing + rejections (editable while at_processing OR processed) */}
              {stage3Editable && (
                <div style={{ marginTop: 12, padding: 12, background: '#13294b', borderRadius: 10, border: '1px solid rgba(167,139,250,0.4)' }}>
                  <p style={{ ...lab, color: '#a78bfa' }}>Step 3 · Case packing per size + rejected items</p>

                  {/* Per-size case grid (10lb + 40lb master) */}
                  <div style={{ background: '#0b1628', borderRadius: 8, padding: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 0.9fr', gap: 6, fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      <span>Size</span>
                      <span style={{ textAlign: 'center' }}>10lb cases</span>
                      <span style={{ textAlign: 'center' }}>40lb master cases</span>
                      <span style={{ textAlign: 'right' }}>Total lbs</span>
                    </div>
                    {LOBSTER_SIZES.map((sz) => {
                      const row = cb[sz] ?? { ten_lb: 0, forty_lb: 0 };
                      const lbs = (Number(row.ten_lb) || 0) * 10 + (Number(row.forty_lb) || 0) * 40;
                      return (
                        <div key={sz} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 0.9fr', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{sz}</span>
                          <input type="number" inputMode="numeric" min="0" placeholder="0"
                            value={row.ten_lb || ''}
                            onChange={(e) => setCase(b, sz, 'ten_lb', Number(e.target.value) || 0)}
                            style={{ ...inp, textAlign: 'center', padding: '6px 8px' }} />
                          <input type="number" inputMode="numeric" min="0" placeholder="0"
                            value={row.forty_lb || ''}
                            onChange={(e) => setCase(b, sz, 'forty_lb', Number(e.target.value) || 0)}
                            style={{ ...inp, textAlign: 'center', padding: '6px 8px' }} />
                          <span style={{ fontSize: 12, color: lbs > 0 ? '#4ade80' : 'rgba(255,255,255,0.4)', textAlign: 'right', fontFamily: 'monospace' }}>{lbs.toFixed(0)}</span>
                        </div>
                      );
                    })}
                    <div style={{ borderTop: '1px solid rgba(245,197,24,0.25)', marginTop: 6, paddingTop: 6, display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 0.9fr', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#f5c518' }}>TOTAL</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textAlign: 'center', fontFamily: 'monospace' }}>{caseTotals.ten_lb}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textAlign: 'center', fontFamily: 'monospace' }}>{caseTotals.forty_lb}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textAlign: 'right', fontFamily: 'monospace' }}>{caseTotals.lbs.toFixed(0)} lbs</span>
                    </div>
                  </div>

                  {/* Rejections — gross weight + line items + notes */}
                  <div style={{ background: '#0b1628', borderRadius: 8, padding: 8, marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1 }}>Rejected products</span>
                      <button type="button" onClick={() => addRejection(b)} style={{ background: 'rgba(248,113,113,0.2)', color: '#f87171', border: '1px solid #f87171', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <label style={miniLab}>Gross rejected weight (lbs)</label>
                      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0"
                        value={(effective(b, 'rejected_weight_lbs') as number | null) ?? ''}
                        onChange={(ev) => patch(b.id, { rejected_weight_lbs: Number(ev.target.value) })}
                        style={inp} />
                    </div>
                    {ri.length === 0 && (
                      <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
                        No rejection line items. Add one if specific sizes were rejected with reason.
                      </div>
                    )}
                    {ri.map((it, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.9fr 0.9fr 2fr auto', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        <select value={it.size} onChange={(e) => updateRejection(b, i, { size: e.target.value })} style={{ ...inp, padding: '6px 8px' }}>
                          {LOBSTER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="lbs"
                          value={it.weight_lbs || ''}
                          onChange={(e) => updateRejection(b, i, { weight_lbs: Number(e.target.value) || 0 })}
                          style={{ ...inp, padding: '6px 8px' }} />
                        <input type="text" placeholder="reason (shell damage, soft, off-color…)"
                          value={it.reason}
                          onChange={(e) => updateRejection(b, i, { reason: e.target.value })}
                          style={{ ...inp, padding: '6px 8px' }} />
                        <button type="button" onClick={() => removeRejection(b, i)} style={{ background: 'transparent', color: '#f87171', border: 'none', fontSize: 16, cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                    <div style={{ marginTop: 6 }}>
                      <label style={miniLab}>Rejection notes</label>
                      <textarea rows={2} placeholder="general comments about rejected products…"
                        value={(effective(b, 'rejection_notes') as string | null) ?? ''}
                        onChange={(e) => patch(b.id, { rejection_notes: e.target.value })}
                        style={{ ...inp, fontFamily: 'inherit' }} />
                    </div>
                  </div>

                  {stage2 ? (
                    <button onClick={() => finishProcessing(b)} disabled={busy === b.id} style={{ ...act, background: '#16a34a', marginTop: 10, width: '100%' }}>
                      {busy === b.id ? 'Saving…' : '✓ Save Steps 2 + 3 — mark processed'}
                    </button>
                  ) : (
                    <button onClick={() => saveStage3(b)} disabled={busy === b.id || !edits[b.id]} style={{ ...act, background: edits[b.id] ? '#a78bfa' : 'rgba(167,139,250,0.3)', marginTop: 10, width: '100%' }}>
                      {busy === b.id ? 'Saving…' : edits[b.id] ? '💾 Save Step 3 updates' : 'No changes'}
                    </button>
                  )}
                </div>
              )}

              {/* Read-only Step 3 summary for processed batches with saved data */}
              {b.status === 'processed' && b.case_size_breakdown && (
                <div style={{ marginTop: 10, padding: 10, background: '#0b1628', borderRadius: 8, fontSize: 11 }}>
                  <p style={lab}>Step 3 summary (saved)</p>
                  <Row k="Yield %"           v={b.yield_pct          != null ? `${Number(b.yield_pct).toFixed(1)} %`           : '—'} />
                  <Row k="Cost / lb"         v={b.product_cost_per_lb != null ? `$${Number(b.product_cost_per_lb).toFixed(4)}` : '—'} />
                  <Row k="Production"        v={b.production_date     || '—'} />
                  <Row k="Expiry"            v={b.expiry_date         || '—'} />
                  <Row k="Freezer"           v={b.freezer_position    || '—'} />
                  <Row k="Rejected (gross)"  v={b.rejected_weight_lbs != null ? `${Number(b.rejected_weight_lbs).toFixed(1)} lbs` : '—'} />
                </div>
              )}
            </article>
          );
        })}
      </main>
    </div>
  );
}

type StepState = 'done' | 'active' | 'next' | 'pending' | 'rejected';
function StageTracker({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999,
            background:
              s.state === 'done'     ? 'rgba(34,197,94,0.15)' :
              s.state === 'active'   ? 'rgba(251,191,36,0.20)' :
              s.state === 'next'     ? 'rgba(96,165,250,0.20)' :
              s.state === 'rejected' ? 'rgba(248,113,113,0.15)' :
              'rgba(255,255,255,0.05)',
            color:
              s.state === 'done'     ? '#4ade80' :
              s.state === 'active'   ? '#fbbf24' :
              s.state === 'next'     ? '#60a5fa' :
              s.state === 'rejected' ? '#f87171' :
              'rgba(255,255,255,0.4)',
            border: s.state === 'active' || s.state === 'next' ? `1px solid currentColor` : '1px solid transparent',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {s.state === 'done' && '✓ '}{s.label}
          </span>
          {i < steps.length - 1 && (
            <span style={{
              fontSize: 14, fontWeight: 900,
              color: steps[i + 1].state === 'active' || steps[i + 1].state === 'next' ? '#fbbf24' : 'rgba(255,255,255,0.25)',
            }}>→</span>
          )}
        </span>
      ))}
    </div>
  );
}

function sumCases(cb: CaseBreakdown): { ten_lb: number; forty_lb: number; lbs: number } {
  let ten = 0, forty = 0;
  for (const k of Object.keys(cb)) {
    ten   += Number(cb[k]?.ten_lb)   || 0;
    forty += Number(cb[k]?.forty_lb) || 0;
  }
  return { ten_lb: ten, forty_lb: forty, lbs: ten * 10 + forty * 40 };
}

function LiveMath({ raw_weight_lbs, finished_weight_lbs, payout_snapshot, production_date, shelf_life_days }:
  { raw_weight_lbs: number; finished_weight_lbs: number; payout_snapshot: number; production_date: string; shelf_life_days: number }) {
  const yieldPct = raw_weight_lbs > 0 && finished_weight_lbs > 0 ? (finished_weight_lbs / raw_weight_lbs) * 100 : null;
  const costPerLb = finished_weight_lbs > 0 && payout_snapshot > 0 ? payout_snapshot / finished_weight_lbs : null;
  let expiry: string | null = null;
  if (production_date && shelf_life_days) {
    const d = new Date(production_date);
    d.setDate(d.getDate() + shelf_life_days);
    expiry = d.toISOString().slice(0, 10);
  }
  return (
    <div style={{ marginTop: 10, padding: 10, background: '#0b1628', borderRadius: 8, fontSize: 12, color: '#fff' }}>
      <p style={{ fontSize: 10, color: '#f5c518', letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Auto-computed</p>
      <Row k="Yield %"        v={yieldPct  != null ? yieldPct.toFixed(1) + ' %' : '—'} />
      <Row k="Cost / lb"      v={costPerLb != null ? '$' + costPerLb.toFixed(4) : '—'} />
      <Row k="Expiry"         v={expiry ?? '—'} />
    </div>
  );
}

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties   = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 10 };
const act: React.CSSProperties  = { color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const inp: React.CSSProperties  = { width: '100%', padding: '8px 10px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 13, boxSizing: 'border-box' };
const lab: React.CSSProperties  = { fontSize: 10, color: '#f5c518', letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 };
const miniLab: React.CSSProperties = { display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 3 };
const chip: React.CSSProperties = { display: 'inline-block', padding: '4px 10px', borderRadius: 6, background: 'rgba(245,197,24,0.15)', color: '#f5c518', textDecoration: 'none', fontSize: 11, marginRight: 6, marginTop: 4 };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{k}</span>
      <span style={{ color: '#fff' }}>{v}</span>
    </div>
  );
}
