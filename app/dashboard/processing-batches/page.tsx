'use client';

// /dashboard/processing-batches — Spiny Tail processing facility view.
//
// Operators search/scan by batch_number, see the entire trace (3 phases
// + GPS), record intake weight, then on completion record finished
// boxes + finished weight + production date + final QC notes. The DB
// trigger auto-computes yield % + product cost per lb + expiry date.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { gmapsLink } from '@/lib/traceability/batch';

const QC_ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver']);

interface BatchRow {
  id: string; batch_number: string; listing_id: string; vendor_id: string; vendor_type: string;
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

  // edit state, keyed by batch id
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
    // Include 'processed' so operators can re-print labels for recently
    // finished batches without hunting through history.
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

  async function startProcessing(b: BatchRow) {
    setBusy(b.id);
    const e = edits[b.id] ?? {};
    const raw_weight_lbs = Number(e.raw_weight_lbs ?? b.raw_weight_lbs ?? 0);
    if (!raw_weight_lbs || raw_weight_lbs <= 0) { alert('Record raw weight first.'); setBusy(null); return; }
    await supabase.from('traceability_batches').update({
      raw_weight_lbs,
      status: 'at_processing',
    }).eq('id', b.id);
    setBusy(null);
    await load();
  }

  async function finishProcessing(b: BatchRow) {
    setBusy(b.id);
    const e = edits[b.id] ?? {};
    const { data: { session } } = await supabase.auth.getSession();
    const update: Record<string, unknown> = {
      finished_boxes:        e.finished_boxes      != null ? Number(e.finished_boxes)      : b.finished_boxes,
      finished_weight_lbs:   e.finished_weight_lbs != null ? Number(e.finished_weight_lbs) : b.finished_weight_lbs,
      production_date:       e.production_date     ?? b.production_date ?? new Date().toISOString().slice(0, 10),
      final_qc_notes:        e.final_qc_notes      ?? b.final_qc_notes  ?? null,
      processing_operator_id: session?.user.id ?? null,
      status:                'processed',
      processed_at:          new Date().toISOString(),
    };
    if (!update.finished_weight_lbs || Number(update.finished_weight_lbs) <= 0) {
      alert('Finished weight required.'); setBusy(null); return;
    }
    await supabase.from('traceability_batches').update(update).eq('id', b.id);
    setBusy(null);
    await load();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.toLowerCase();
    return batches.filter((b) =>
      b.batch_number.toLowerCase().includes(q) ||
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
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{batches.length} batch{batches.length === 1 ? '' : 'es'} in flight</p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batch number, product, vendor…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, marginBottom: 12 }} />
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>No batches in flight 🎉</div>}

        {filtered.map((b) => {
          const v   = vendors[b.vendor_id];
          const lst = listings[b.listing_id];
          const ps  = phases[b.listing_id] ?? [];
          const e   = edits[b.id] ?? {};
          const stage1 = b.status === 'pending_processing';
          const stage2 = b.status === 'at_processing';
          return (
            <article key={b.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#f5c518', fontWeight: 700 }}>{b.batch_number}</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{b.product_name}{b.scientific_name ? ` (${b.scientific_name})` : ''}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {v?.business_name ?? 'Vendor'} · {b.vendor_type}{lst ? ` · ${Number(lst.quantity_available).toFixed(0)} ${lst.unit}` : ''}
                    {b.quantity_units ? ` · ${b.quantity_units} ${b.quantity_unit_type ?? 'bag'}${b.quantity_units === 1 ? '' : 's'} in` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <span style={{ background: stage1 ? 'rgba(245,197,24,0.2)' : stage2 ? 'rgba(96,165,250,0.2)' : 'rgba(22,163,74,0.2)', color: stage1 ? '#f5c518' : stage2 ? '#60a5fa' : '#4ade80', padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{b.status.replace(/_/g, ' ')}</span>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>shelf life {b.shelf_life_days ?? '—'}d</div>
                  {b.status === 'processed' && (
                    <Link href={`/dashboard/processing-batches/${b.id}/labels`} style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 8, background: '#f5c518', color: '#060d1f', fontWeight: 800, fontSize: 11, textDecoration: 'none' }}>
                      🖨 Print labels
                    </Link>
                  )}
                </div>
              </div>

              {/* vessel / farm context */}
              <div style={{ marginTop: 10, padding: 10, background: '#0b1628', borderRadius: 8, fontSize: 11 }}>
                <p style={lab}>{b.vendor_type === 'fisherman' ? 'Vessel' : b.vendor_type === 'farmer' ? 'Farm' : 'Vendor'} context</p>
                {b.vendor_type === 'fisherman' && (
                  <>
                    <Row k="Vessel"      v={b.vessel_name        || '—'} />
                    <Row k="Registration" v={b.vessel_registration || '—'} />
                    <Row k="Captain"     v={b.captain_name        || '—'} />
                    <Row k="Owner"       v={b.vessel_owner_name   || '—'} />
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

              {/* traceability phases */}
              <div style={{ marginTop: 10, padding: 10, background: '#0b1628', borderRadius: 8 }}>
                <p style={lab}>Traceability</p>
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

              {/* operator workflow */}
              {stage1 && (
                <div style={{ marginTop: 12, padding: 12, background: '#1a2e5a', borderRadius: 10 }}>
                  <p style={lab}>1. Intake — record raw weight</p>
                  <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="raw weight lbs"
                    value={e.raw_weight_lbs ?? b.raw_weight_lbs ?? ''}
                    onChange={(ev) => patch(b.id, { raw_weight_lbs: Number(ev.target.value) })}
                    style={inp} />
                  <button onClick={() => startProcessing(b)} disabled={busy === b.id} style={{ ...act, background: '#16a34a', marginTop: 8 }}>
                    {busy === b.id ? 'Saving…' : 'Start processing'}
                  </button>
                </div>
              )}

              {stage2 && (
                <div style={{ marginTop: 12, padding: 12, background: '#1a2e5a', borderRadius: 10 }}>
                  <p style={lab}>2. Finish — production date stamps expiry, finished weight stamps yield + cost</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={miniLab}>Finished boxes</label>
                      <input type="number" inputMode="numeric" min="0" placeholder="count"
                        value={e.finished_boxes ?? b.finished_boxes ?? ''}
                        onChange={(ev) => patch(b.id, { finished_boxes: Number(ev.target.value) })}
                        style={inp} />
                    </div>
                    <div>
                      <label style={miniLab}>Finished weight (lbs) *</label>
                      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="lbs"
                        value={e.finished_weight_lbs ?? b.finished_weight_lbs ?? ''}
                        onChange={(ev) => patch(b.id, { finished_weight_lbs: Number(ev.target.value) })}
                        style={inp} />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={miniLab}>Production date</label>
                    <input type="date" value={e.production_date ?? b.production_date ?? new Date().toISOString().slice(0,10)}
                      onChange={(ev) => patch(b.id, { production_date: ev.target.value })}
                      style={inp} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={miniLab}>Final QC notes</label>
                    <textarea rows={2} value={e.final_qc_notes ?? b.final_qc_notes ?? ''}
                      onChange={(ev) => patch(b.id, { final_qc_notes: ev.target.value })}
                      style={{ ...inp, fontFamily: 'inherit' }} placeholder="Quality, temperature, any issues…" />
                  </div>

                  {/* live preview of computed math */}
                  <LiveMath
                    raw_weight_lbs={Number(e.raw_weight_lbs ?? b.raw_weight_lbs ?? 0)}
                    finished_weight_lbs={Number(e.finished_weight_lbs ?? b.finished_weight_lbs ?? 0)}
                    payout_snapshot={Number(b.vendor_payout_snapshot ?? 0)}
                    production_date={(e.production_date ?? b.production_date ?? '') as string}
                    shelf_life_days={Number(b.shelf_life_days ?? 0)}
                  />

                  <button onClick={() => finishProcessing(b)} disabled={busy === b.id} style={{ ...act, background: '#16a34a', marginTop: 10 }}>
                    {busy === b.id ? 'Saving…' : '✓ Mark processed'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </main>
    </div>
  );
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
