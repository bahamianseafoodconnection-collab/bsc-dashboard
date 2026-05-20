'use client';

// /spinytails/lots/[lot_code]
//
// Full chain view of one lot with inline action panels:
//   - Vessel + intake snapshot (Step 1-2)
//   - QC inspections list + Add
//   - Temperature logs list + Add
//   - Processing batches list + Add (with per-grade breakdown)
//   - Master packaging list + Add (CCP-5 — declarations enforced)
//   - Shipment links (read-only here)
//   - Corrective action shortcut
//   - Status transitions (received → in_receiving_freezer → thawing →
//     processing → blast_freezing → mastered → in_distribution → shipped)

import { useCallback, useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

const LOT_STATUSES = [
  'received','in_receiving_freezer','thawing','processing','blast_freezing',
  'mastered','in_distribution','shipped','rejected','recalled',
] as const;
type LotStatus = typeof LOT_STATUSES[number];

const TEMP_LOCATIONS = [
  'receiving_freezer','thaw_vat','processing_room_ambient',
  'blast_freezer','distribution_freezer','transport_vehicle',
] as const;

const LOBSTER_GRADES = [
  '5oz','6oz','7oz','8oz','9oz','10_12oz','12_14oz','14_16oz','16_20oz','20oz_plus','not_for_export',
] as const;

interface Lot {
  id: string; lot_code: string; receipt_date: string; status: LotStatus;
  vessel_id: string; created_at: string; rejected_reason: string | null;
}
interface Vessel { id: string; vessel_code: string; vessel_name: string | null; fisherman_name: string; color_tag: string; status: string; }
interface Intake {
  id: string; quantity_lbs: number; product_state: 'fresh' | 'frozen';
  core_temp_f_at_receipt: number | null; fishing_area: string | null;
  fishing_date_start: string | null; fishing_date_end: string | null;
  intake_time: string; notes: string | null;
}
interface QC {
  id: string; inspected_at: string; sample_lbs: number; sulfite_ppm: number | null;
  result: 'pass' | 'fail' | 'pending';
  egg_bearing_found: boolean | null; soft_shell_found: boolean | null;
  off_odor: boolean | null; foreign_matter_found: boolean | null; notes: string | null;
}
interface TempLog {
  id: string; logged_at: string; location: string; reading_f: number;
  within_limit: boolean; data_logger_confirms: boolean | null; action_if_fail: string | null;
}
interface Batch {
  id: string; started_at: string; ended_at: string | null;
  lbs_in: number; lbs_graded: number; lbs_not_for_export: number;
  yield_pct: number | null; sulfite_recheck_ppm: number | null; boxes_packed: number | null; notes: string | null;
}
interface Grade { id: string; batch_id: string; grade: string; weight_lbs: number; box_count: number; }
interface Packaging {
  id: string; packaged_at: string;
  primary_boxes_10lb: number; master_cartons_40lb: number;
  sulfite_declaration_present: boolean; allergen_declaration_present: boolean;
  scientific_name_present: boolean; lot_code_matches_inside: boolean;
  production_date_printed: boolean; best_before_date_printed: boolean; notes: string | null;
}
interface ShipmentLink {
  shipment_id: string; lot_id: string; master_cartons: number; weight_lbs: number;
  shipments: { shipment_number: string; shipped_at: string; destination_customer: string; destination_country: string } | null;
}
interface Consumption {
  id:           string;
  order_id:     string;
  product_id:   string | null;
  quantity_lbs: number | null;
  notes:        string | null;
  recorded_at:  string;
  // hydrated via joins:
  order_customer_name?: string | null;
  order_total?:         number | null;
  order_created_at?:    string;
  product_sku?:         string | null;
  product_name?:        string | null;
}
interface ProductMini { id: string; sku: string; name: string; }

export default function LotDetailPage({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = usePromise(params);
  const decoded = decodeURIComponent(lot_code);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [lot, setLot] = useState<Lot | null>(null);
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [qcs, setQcs] = useState<QC[]>([]);
  const [temps, setTemps] = useState<TempLog[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [packagings, setPackagings] = useState<Packaging[]>([]);
  const [shipments, setShipments] = useState<ShipmentLink[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);

  // Consumption recorder form state
  const [conOrderId,   setConOrderId]   = useState('');
  const [conProductId, setConProductId] = useState<string>('');
  const [conQtyLbs,    setConQtyLbs]    = useState<string>('');
  const [conNotes,     setConNotes]     = useState('');
  const [conPreview,   setConPreview]   = useState<{ customer_name: string | null; total: number | null; created_at: string | null } | null>(null);
  const [conSaving,    setConSaving]    = useState(false);
  const [conToast,     setConToast]     = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = `/staff-login?next=/spinytails/lots/${lot_code}`; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
    })();
  }, [lot_code]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: lotRow } = await supabase.from('spinytails_lots').select('*').eq('lot_code', decoded).maybeSingle();
    if (!lotRow) { setErr(`Lot ${decoded} not found`); setLoading(false); return; }
    setLot(lotRow as Lot);

    const [{ data: v }, { data: i }, { data: q }, { data: t }, { data: b }, { data: p }, { data: s }] = await Promise.all([
      supabase.from('spinytails_vessels').select('*').eq('id', (lotRow as Lot).vessel_id).maybeSingle(),
      supabase.from('spinytails_lot_intakes').select('*').eq('lot_id', (lotRow as Lot).id).maybeSingle(),
      supabase.from('spinytails_quality_inspections').select('*').eq('lot_id', (lotRow as Lot).id).order('inspected_at', { ascending: false }),
      supabase.from('spinytails_temperature_logs').select('*').eq('lot_id', (lotRow as Lot).id).order('logged_at', { ascending: false }).limit(50),
      supabase.from('spinytails_processing_batches').select('*').eq('lot_id', (lotRow as Lot).id).order('started_at', { ascending: false }),
      supabase.from('spinytails_master_packagings').select('*').eq('lot_id', (lotRow as Lot).id).order('packaged_at', { ascending: false }),
      supabase.from('spinytails_shipment_lots').select('shipment_id, lot_id, master_cartons, weight_lbs, shipments:spinytails_shipments(shipment_number, shipped_at, destination_customer, destination_country)').eq('lot_id', (lotRow as Lot).id),
    ]);
    setVessel(v as Vessel | null);
    setIntake(i as Intake | null);
    setQcs((q ?? []) as QC[]);
    setTemps((t ?? []) as TempLog[]);
    setBatches((b ?? []) as Batch[]);
    setPackagings((p ?? []) as Packaging[]);
    setShipments((s ?? []) as unknown as ShipmentLink[]);

    const batchIds = ((b ?? []) as Batch[]).map(r => r.id);
    if (batchIds.length > 0) {
      const { data: g } = await supabase.from('spinytails_batch_grades').select('*').in('batch_id', batchIds);
      setGrades((g ?? []) as Grade[]);
    } else {
      setGrades([]);
    }

    // Order lot consumption — who consumed this lot.
    const { data: olcRows } = await supabase
      .from('order_lot_consumption')
      .select('id, order_id, product_id, quantity_lbs, notes, recorded_at, orders(customer_name, total, created_at), products(sku, name)')
      .eq('lot_id', (lotRow as Lot).id)
      .order('recorded_at', { ascending: false });
    const built: Consumption[] = ((olcRows ?? []) as unknown as Array<{
      id: string; order_id: string; product_id: string | null;
      quantity_lbs: number | null; notes: string | null; recorded_at: string;
      orders:   { customer_name: string | null; total: number | null; created_at: string } | { customer_name: string | null; total: number | null; created_at: string }[] | null;
      products: { sku: string; name: string } | { sku: string; name: string }[] | null;
    }>).map(r => {
      const ord  = Array.isArray(r.orders)   ? r.orders[0]   : r.orders;
      const prod = Array.isArray(r.products) ? r.products[0] : r.products;
      return {
        id:                  r.id,
        order_id:            r.order_id,
        product_id:          r.product_id,
        quantity_lbs:        r.quantity_lbs,
        notes:               r.notes,
        recorded_at:         r.recorded_at,
        order_customer_name: ord?.customer_name ?? null,
        order_total:         ord?.total ?? null,
        order_created_at:    ord?.created_at,
        product_sku:         prod?.sku ?? null,
        product_name:        prod?.name ?? null,
      };
    });
    setConsumptions(built);

    // Small product catalog for the picker — only sell_online products (most likely to be in orders).
    const { data: prods } = await supabase
      .from('products')
      .select('id, sku, name')
      .eq('status', 'active')
      .order('name')
      .limit(500);
    setProductCatalog((prods ?? []) as ProductMini[]);
    setLoading(false);
  }, [decoded]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function changeStatus(newStatus: LotStatus, rejectedReason?: string) {
    if (!lot) return;
    setStatusBusy(true);
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'rejected') patch.rejected_at = new Date().toISOString();
    if (newStatus === 'rejected' && rejectedReason) patch.rejected_reason = rejectedReason;
    if (newStatus === 'shipped')  patch.shipped_at  = new Date().toISOString();
    const { error } = await supabase.from('spinytails_lots').update(patch).eq('id', lot.id);
    setStatusBusy(false);
    if (error) { alert(error.message); return; }
    await load();
  }

  const tempExcursionCount = useMemo(() => temps.filter(t => !t.within_limit).length, [temps]);
  const totalCases40 = useMemo(() => packagings.reduce((s, p) => s + p.master_cartons_40lb, 0), [packagings]);
  const totalCases10 = useMemo(() => packagings.reduce((s, p) => s + p.primary_boxes_10lb, 0), [packagings]);

  // Resolve the typed order id (full UUID or short prefix) to the actual order
  async function previewOrder(input: string) {
    const v = input.trim();
    if (!v) { setConPreview(null); return; }
    let query = supabase.from('orders').select('id, customer_name, total, created_at').limit(2);
    // Full UUID? exact match. Else prefix.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      query = query.eq('id', v);
    } else {
      // Use text-cast prefix match. Supabase exposes this via ilike on cast.
      query = query.filter('id::text', 'ilike', `${v}%`);
    }
    const { data } = await query;
    if (!data || data.length === 0)  { setConPreview(null); return; }
    if (data.length > 1)              { setConPreview({ customer_name: '(multiple matches — paste full UUID)', total: null, created_at: null }); return; }
    const o = data[0] as { id: string; customer_name: string | null; total: number | null; created_at: string };
    setConOrderId(o.id);
    setConPreview({ customer_name: o.customer_name, total: o.total != null ? Number(o.total) : null, created_at: o.created_at });
  }

  async function saveConsumption() {
    if (!lot || !conOrderId.trim()) { setConToast({ ok: false, msg: '⚠ Order ID required' }); return; }
    setConSaving(true); setConToast(null);
    const { data: { session } } = await supabase.auth.getSession();
    const callerId = session?.user?.id ?? null;
    const qty = parseFloat(conQtyLbs);
    const { error } = await supabase.from('order_lot_consumption').insert({
      order_id:     conOrderId.trim(),
      lot_id:       lot.id,
      product_id:   conProductId || null,
      quantity_lbs: Number.isFinite(qty) ? qty : null,
      notes:        conNotes.trim() || null,
      recorded_by:  callerId,
    });
    setConSaving(false);
    if (error) {
      const dup = /duplicate key/i.test(error.message);
      setConToast({ ok: false, msg: dup ? '⚠ This (order, lot, product) combo is already recorded.' : `⚠ ${error.message}` });
      setTimeout(() => setConToast(null), 6000);
      return;
    }
    setConToast({ ok: true, msg: '✓ Consumption recorded' });
    setConOrderId(''); setConProductId(''); setConQtyLbs(''); setConNotes(''); setConPreview(null);
    await load();
    setTimeout(() => setConToast(null), 4000);
  }

  async function deleteConsumption(id: string) {
    if (!confirm('Delete this consumption record? This is an audit log — only remove if it was recorded in error.')) return;
    const { error } = await supabase.from('order_lot_consumption').delete().eq('id', id);
    if (error) { setConToast({ ok: false, msg: `⚠ ${error.message}` }); setTimeout(() => setConToast(null), 6000); return; }
    setConToast({ ok: true, msg: '🗑 Removed' });
    await load();
    setTimeout(() => setConToast(null), 4000);
  }

  if (authed === null) return <div style={pg}>Loading…</div>;
  if (err) return <div style={pg}><div style={{ padding: 20, color: '#f87171' }}>⚠ {err} <Link href="/spinytails" style={{ color: '#f5c518' }}>← back</Link></div></div>;
  if (loading || !lot) return <div style={pg}><div style={{ padding: 20, color: 'rgba(255,255,255,0.55)' }}>Loading…</div></div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Link href="/spinytails" style={back}>← Spiny Tails</Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ ...h1, fontFamily: 'monospace' }}>{lot.lot_code}</h1>
            <StatusBadge status={lot.status} />
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {vessel ? `${vessel.vessel_code} · ${vessel.fisherman_name} · ${vessel.color_tag}` : '—'} · received {lot.receipt_date}
          </p>
          {(() => {
            // Map current status → SOP step number for the in-context SOP link
            const stepForStatus: Record<string, number> = {
              received: 2, in_receiving_freezer: 3, thawing: 4, processing: 5,
              blast_freezing: 8, mastered: 9, in_distribution: 10, shipped: 11,
            };
            const step = stepForStatus[lot.status];
            if (!step) return null;
            return (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/spinytails/steps?step=${step}`}
                  style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800, textDecoration: 'none' }}>
                  📘 Step {step} SOP for this stage →
                </Link>
                <Link href="/spinytails/documents"
                  style={{ background: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: '1px solid #22d3ee', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800, textDecoration: 'none' }}>
                  🧼 All SSOPs
                </Link>
                <Link href={`/spinytails/lots/${encodeURIComponent(lot.lot_code)}/stickers`}
                  style={{ background: 'rgba(245,197,24,0.12)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800, textDecoration: 'none' }}
                  title="Print Avery 5163 trace QR stickers — 10 per sheet, one per carton">
                  🏷 Print trace stickers
                </Link>
              </div>
            );
          })()}
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
        {/* Status transition strip */}
        <div style={card}>
          <p style={lab}>Step / status</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {LOT_STATUSES.filter(s => !['rejected','recalled'].includes(s)).map((s, i) => {
              const cur = LOT_STATUSES.indexOf(lot.status);
              const idx = i;
              const done = cur > idx;
              const active = cur === idx;
              return (
                <button key={s} onClick={() => changeStatus(s)} disabled={statusBusy}
                  style={{
                    fontSize: 9, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                    border: 'none',
                    background: done ? 'rgba(34,197,94,0.18)' : active ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.05)',
                    color:      done ? '#4ade80' : active ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                  {done && '✓ '}{s.replace(/_/g, ' ')}
                </button>
              );
            })}
            <button onClick={() => {
              const r = prompt('Reject this lot — reason?');
              if (r) changeStatus('rejected', r);
            }} disabled={statusBusy}
              style={{ fontSize: 9, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: 'none',
                background: 'rgba(248,113,113,0.12)', color: '#f87171', textTransform: 'uppercase' }}>
              ✗ reject
            </button>
          </div>
          {lot.rejected_reason && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>Rejected: {lot.rejected_reason}</p>}
        </div>

        {/* Vessel + intake snapshot */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <div style={card}>
            <p style={lab}>Vessel</p>
            <Row k="Code"          v={vessel?.vessel_code ?? '—'} />
            <Row k="Fisherman"     v={vessel?.fisherman_name ?? '—'} />
            <Row k="Vessel name"   v={vessel?.vessel_name ?? '—'} />
            <Row k="Color tag"     v={vessel?.color_tag ?? '—'} />
          </div>
          <div style={card}>
            <p style={lab}>Intake (Step 1-2)</p>
            <Row k="Quantity"      v={intake ? `${intake.quantity_lbs.toFixed(1)} lbs` : '—'} />
            <Row k="State"         v={intake?.product_state ?? '—'} />
            <Row k="Temp at receipt" v={intake?.core_temp_f_at_receipt != null ? `${intake.core_temp_f_at_receipt.toFixed(1)}°F` : '—'} />
            <Row k="Fishing area"  v={intake?.fishing_area ?? '—'} />
          </div>
          <div style={card}>
            <p style={lab}>Cold chain</p>
            <Row k="Temp logs"     v={`${temps.length} record${temps.length === 1 ? '' : 's'}`} />
            <Row k="Excursions"    v={tempExcursionCount > 0 ? `⚠ ${tempExcursionCount}` : '0'} />
            <Row k="Cases packed"  v={`${totalCases40} × 40lb · ${totalCases10} × 10lb`} />
            <Row k="Shipments"     v={shipments.length.toString()} />
          </div>
        </div>

        {/* Quality inspections */}
        <Section title="Quality inspections" countLabel={`${qcs.length}`} action={
          <AddInspection lotId={lot.id} onSaved={load} />
        }>
          {qcs.length === 0 ? (
            <p style={emptyP}>No inspections yet.</p>
          ) : (
            qcs.map(q => (
              <div key={q.id} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                    {new Date(q.inspected_at).toLocaleString()}
                    <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: q.result === 'pass' ? 'rgba(34,197,94,0.18)' : q.result === 'fail' ? 'rgba(248,113,113,0.18)' : 'rgba(251,191,36,0.18)',
                      color:      q.result === 'pass' ? '#4ade80'             : q.result === 'fail' ? '#f87171'             : '#fbbf24',
                      textTransform: 'uppercase', fontWeight: 800 }}>
                      {q.result}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    sample {q.sample_lbs} lbs · sulfite {q.sulfite_ppm ?? '—'} ppm
                    {q.egg_bearing_found && ' · 🥚 egg-bearing'}
                    {q.soft_shell_found && ' · 🦞 soft shell'}
                    {q.off_odor && ' · 👃 off odor'}
                    {q.foreign_matter_found && ' · ⚠ foreign matter'}
                  </div>
                  {q.notes && <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>{q.notes}</div>}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* Temperature logs */}
        <Section title="Temperature logs" countLabel={`${temps.length}`} action={
          <AddTempLog lotId={lot.id} onSaved={load} />
        }>
          {temps.length === 0 ? <p style={emptyP}>No temp logs yet.</p> :
            temps.slice(0, 10).map(t => (
              <div key={t.id} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#fff' }}>
                    {new Date(t.logged_at).toLocaleString()} · {t.location.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {t.reading_f.toFixed(1)}°F · {t.within_limit ? '✓ in range' : <span style={{ color: '#f87171' }}>⚠ out of range</span>}
                    {t.action_if_fail && ` · ${t.action_if_fail}`}
                  </div>
                </div>
              </div>
            ))
          }
          {temps.length > 10 && <p style={emptyP}>+{temps.length - 10} more older logs</p>}
        </Section>

        {/* Processing batches */}
        <Section title="Processing batches" countLabel={`${batches.length}`} action={
          <AddBatch lotId={lot.id} onSaved={load} />
        }>
          {batches.length === 0 ? <p style={emptyP}>No processing batches yet.</p> :
            batches.map(b => {
              const myGrades = grades.filter(g => g.batch_id === b.id);
              return (
                <div key={b.id} style={{ ...row, flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                      Started {new Date(b.started_at).toLocaleString()}{b.ended_at ? ` → ended ${new Date(b.ended_at).toLocaleTimeString()}` : ' · in progress'}
                    </div>
                    <div style={{ fontSize: 12, color: '#f5c518', fontWeight: 800 }}>
                      Yield {b.yield_pct ?? '—'}%
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    in {b.lbs_in.toFixed(1)} → graded {b.lbs_graded.toFixed(1)} · not for export {b.lbs_not_for_export.toFixed(1)}
                    {b.sulfite_recheck_ppm != null && ` · sulfite recheck ${b.sulfite_recheck_ppm} ppm`}
                  </div>
                  {myGrades.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {myGrades.map(g => (
                        <span key={g.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,197,24,0.12)', color: '#f5c518', fontWeight: 700 }}>
                          {g.grade.replace(/_/g, '-')} · {g.weight_lbs.toFixed(1)} lbs · {g.box_count} box
                        </span>
                      ))}
                    </div>
                  )}
                  {!b.ended_at && <AddGrade batchId={b.id} onSaved={load} />}
                </div>
              );
            })
          }
        </Section>

        {/* Master packagings */}
        <Section title="Master packagings (CCP-5)" countLabel={`${packagings.length}`} action={
          <AddPackaging lotId={lot.id} onSaved={load} />
        }>
          {packagings.length === 0 ? <p style={emptyP}>No packagings yet.</p> :
            packagings.map(p => (
              <div key={p.id} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                    {new Date(p.packaged_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {p.master_cartons_40lb} × 40lb master · {p.primary_boxes_10lb} × 10lb primary
                  </div>
                  <div style={{ fontSize: 10, color: '#4ade80', marginTop: 2 }}>
                    ✓ sulfite ✓ allergen ✓ scientific ✓ lot-match ✓ packed ✓ best-before
                  </div>
                </div>
              </div>
            ))
          }
        </Section>

        {/* Shipments (read-only) */}
        {shipments.length > 0 && (
          <Section title="Shipments" countLabel={`${shipments.length}`}>
            {shipments.map((sl, i) => (
              <div key={`${sl.shipment_id}-${i}`} style={row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                    {sl.shipments?.shipment_number ?? sl.shipment_id.slice(0, 8)} · {sl.shipments?.destination_customer}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {sl.shipments?.shipped_at ? new Date(sl.shipments.shipped_at).toLocaleDateString() : '—'} · {sl.master_cartons} cartons · {sl.weight_lbs.toFixed(1)} lbs · {sl.shipments?.destination_country}
                  </div>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Sold to orders — closes the trace loop */}
        <Section title="Sold to orders (consumption)" countLabel={`${consumptions.length}`}>
          {consumptions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', padding: '6px 0' }}>
              No order consumption recorded yet. Add the first record below when a case ships against a specific customer order.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {consumptions.map(c => (
                <div key={c.id} style={row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>
                      {c.order_customer_name ?? '(no customer name)'}
                      {c.order_total != null && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>· ${Number(c.order_total).toFixed(2)}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
                      order {c.order_id.slice(0, 8)}…
                      {c.product_sku && <> · {c.product_sku}</>}
                      {c.quantity_lbs != null && <> · {Number(c.quantity_lbs).toFixed(2)} lbs</>}
                      {' · '}{new Date(c.recorded_at).toLocaleDateString()}
                    </div>
                    {c.notes && <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>{c.notes}</div>}
                  </div>
                  <button onClick={() => deleteConsumption(c.id)}
                    style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Recorder form */}
          <div style={{ marginTop: 12, padding: 10, background: '#060d1f', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>+ Record a new consumption</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              <div>
                <label style={lab}>Order ID (paste UUID or first 8 chars)</label>
                <input type="text" value={conOrderId}
                  onChange={ev => { setConOrderId(ev.target.value); setConPreview(null); }}
                  onBlur={ev => previewOrder(ev.target.value)}
                  placeholder="e.g. a1b2c3d4 or full UUID"
                  style={{ background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%', fontFamily: 'monospace' }} />
                {conPreview && (
                  <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
                    → {conPreview.customer_name ?? '(unknown customer)'}
                    {conPreview.total != null && <> · ${conPreview.total.toFixed(2)}</>}
                    {conPreview.created_at && <> · {new Date(conPreview.created_at).toLocaleDateString()}</>}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
                <div>
                  <label style={lab}>Product (optional)</label>
                  <select value={conProductId} onChange={ev => setConProductId(ev.target.value)}
                    style={{ background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%' }}>
                    <option value="">— none —</option>
                    {productCatalog.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lab}>Qty (lbs)</label>
                  <input type="number" step="0.001" min="0" value={conQtyLbs}
                    onChange={ev => setConQtyLbs(ev.target.value)} placeholder="(optional)"
                    style={{ background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%' }} />
                </div>
              </div>
              <div>
                <label style={lab}>Notes (optional)</label>
                <input type="text" value={conNotes} onChange={ev => setConNotes(ev.target.value)}
                  placeholder='e.g. "1 master carton at packout"'
                  style={{ background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%' }} />
              </div>
              {conToast && (
                <div style={{ fontSize: 11, fontWeight: 700,
                  background: conToast.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                  color:      conToast.ok ? '#4ade80' : '#f87171',
                  border:    `1px solid ${conToast.ok ? '#16a34a' : '#f87171'}`,
                  borderRadius: 6, padding: '4px 8px' }}>
                  {conToast.msg}
                </div>
              )}
              <button onClick={saveConsumption} disabled={conSaving || !conOrderId.trim()}
                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: (conSaving || !conOrderId.trim()) ? 0.5 : 1, marginTop: 4 }}>
                {conSaving ? 'Saving…' : '✓ Save consumption'}
              </button>
            </div>
          </div>
        </Section>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 16 }}>
          Need a corrective action? Use the dashboard /spinytails (CAPA tracker coming in Phase 1B).
        </p>
      </main>
    </div>
  );
}

// ─────────────── Section wrapper ──────────────────────────────
function Section({ title, countLabel, action, children }: { title: string; countLabel?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <p style={{ ...lab, margin: 0 }}>{title}{countLabel ? ` · ${countLabel}` : ''}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: LotStatus }) {
  const colors: Record<LotStatus, [string, string]> = {
    received:             ['rgba(245,197,24,0.2)', '#f5c518'],
    in_receiving_freezer: ['rgba(96,165,250,0.2)', '#60a5fa'],
    thawing:              ['rgba(251,191,36,0.2)', '#fbbf24'],
    processing:           ['rgba(167,139,250,0.2)', '#a78bfa'],
    blast_freezing:       ['rgba(96,165,250,0.2)', '#60a5fa'],
    mastered:             ['rgba(74,222,128,0.2)', '#4ade80'],
    in_distribution:      ['rgba(74,222,128,0.2)', '#4ade80'],
    shipped:              ['rgba(34,197,94,0.25)', '#22c55e'],
    rejected:             ['rgba(248,113,113,0.2)', '#f87171'],
    recalled:             ['rgba(248,113,113,0.3)', '#f87171'],
  };
  const [bg, fg] = colors[status];
  return <span style={{ background: bg, color: fg, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{status.replace(/_/g, ' ')}</span>;
}

// ─────────────── Inline add forms ──────────────────────────────

function AddInspection({ lotId, onSaved }: { lotId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState('');
  const [sulfite, setSulfite] = useState('');
  const [result, setResult] = useState<'pass' | 'fail' | 'pending'>('pass');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!sample) { alert('Sample lbs required'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('spinytails_quality_inspections').insert({
      lot_id: lotId, sample_lbs: parseFloat(sample),
      sulfite_ppm: sulfite ? parseFloat(sulfite) : null,
      result, qa_personnel: user?.id ?? null, notes: notes || null,
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setSample(''); setSulfite(''); setResult('pass'); setNotes('');
    setOpen(false); await onSaved();
  }
  if (!open) return <button onClick={() => setOpen(true)} style={addBtn}>+ Add QC</button>;
  return (
    <div style={popoutForm}>
      <input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="sample lbs" type="number" step="0.01" style={miniInp} />
      <input value={sulfite} onChange={(e) => setSulfite(e.target.value)} placeholder="sulfite ppm" type="number" step="0.1" style={miniInp} />
      <select value={result} onChange={(e) => setResult(e.target.value as 'pass' | 'fail' | 'pending')} style={miniInp}>
        <option value="pass">pass</option><option value="fail">fail</option><option value="pending">pending</option>
      </select>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes" style={{ ...miniInp, flex: 2 }} />
      <button onClick={save} disabled={busy} style={saveBtn}>✓</button>
      <button onClick={() => setOpen(false)} style={cancelBtn}>×</button>
    </div>
  );
}

function AddTempLog({ lotId, onSaved }: { lotId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<typeof TEMP_LOCATIONS[number]>('receiving_freezer');
  const [reading, setReading] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!reading) { alert('Reading required'); return; }
    const r = parseFloat(reading);
    // CCP rules: blast/distribution/receiving freezer ≤ 0°F, thaw_vat ≤ 40°F, transport ≤ 0°F
    const max = location === 'thaw_vat' || location === 'processing_room_ambient' ? 40.0 : 0.0;
    const within = r <= max;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('spinytails_temperature_logs').insert({
      lot_id: lotId, location, reading_f: r, within_limit: within,
      recorded_by: user?.id ?? null,
      action_if_fail: within ? null : `⚠ exceeded ${max}°F at ${location.replace(/_/g, ' ')}`,
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setReading(''); setOpen(false); await onSaved();
  }
  if (!open) return <button onClick={() => setOpen(true)} style={addBtn}>+ Add temp</button>;
  return (
    <div style={popoutForm}>
      <select value={location} onChange={(e) => setLocation(e.target.value as typeof TEMP_LOCATIONS[number])} style={miniInp}>
        {TEMP_LOCATIONS.map(l => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
      </select>
      <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder="°F" type="number" step="0.1" style={miniInp} />
      <button onClick={save} disabled={busy} style={saveBtn}>✓</button>
      <button onClick={() => setOpen(false)} style={cancelBtn}>×</button>
    </div>
  );
}

function AddBatch({ lotId, onSaved }: { lotId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [lbsIn, setLbsIn] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!lbsIn) { alert('Lbs in required'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('spinytails_processing_batches').insert({
      lot_id: lotId, lbs_in: parseFloat(lbsIn), supervisor_id: user?.id ?? null,
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setLbsIn(''); setOpen(false); await onSaved();
  }
  if (!open) return <button onClick={() => setOpen(true)} style={addBtn}>+ Start batch</button>;
  return (
    <div style={popoutForm}>
      <input value={lbsIn} onChange={(e) => setLbsIn(e.target.value)} placeholder="lbs in" type="number" step="0.01" style={miniInp} />
      <button onClick={save} disabled={busy} style={saveBtn}>✓</button>
      <button onClick={() => setOpen(false)} style={cancelBtn}>×</button>
    </div>
  );
}

function AddGrade({ batchId, onSaved }: { batchId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState<typeof LOBSTER_GRADES[number]>('8oz');
  const [weight, setWeight] = useState('');
  const [boxes, setBoxes] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!weight) { alert('Weight required'); return; }
    setBusy(true);
    const { error } = await supabase.from('spinytails_batch_grades').insert({
      batch_id: batchId, grade, weight_lbs: parseFloat(weight), box_count: parseInt(boxes || '0', 10),
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setWeight(''); setBoxes(''); setOpen(false); await onSaved();
  }
  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ ...addBtn, alignSelf: 'flex-start', marginTop: 6, fontSize: 10 }}>+ Add grade</button>
  );
  return (
    <div style={{ ...popoutForm, marginTop: 6 }}>
      <select value={grade} onChange={(e) => setGrade(e.target.value as typeof LOBSTER_GRADES[number])} style={miniInp}>
        {LOBSTER_GRADES.map(g => <option key={g} value={g}>{g.replace(/_/g, '-')}</option>)}
      </select>
      <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="lbs" type="number" step="0.01" style={miniInp} />
      <input value={boxes} onChange={(e) => setBoxes(e.target.value)} placeholder="boxes" type="number" step="1" style={miniInp} />
      <button onClick={save} disabled={busy} style={saveBtn}>✓</button>
      <button onClick={() => setOpen(false)} style={cancelBtn}>×</button>
    </div>
  );
}

function AddPackaging({ lotId, onSaved }: { lotId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [primary10, setPrimary10] = useState('');
  const [master40, setMaster40]   = useState('');
  // CCP-5 — all must be true to save
  const [sulfite, setSulfite] = useState(true);
  const [allergen, setAllergen] = useState(true);
  const [sciName, setSciName] = useState(true);
  const [lotMatch, setLotMatch] = useState(true);
  const [packed, setPacked] = useState(true);
  const [bestBefore, setBestBefore] = useState(true);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!primary10 || !master40) { alert('Box counts required'); return; }
    if (!sulfite || !allergen || !lotMatch) { alert('CCP-5: sulfite + allergen + lot-match declarations are REQUIRED to save.'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('spinytails_master_packagings').insert({
      lot_id: lotId,
      primary_boxes_10lb:           parseInt(primary10, 10),
      master_cartons_40lb:          parseInt(master40, 10),
      sulfite_declaration_present:  sulfite,
      allergen_declaration_present: allergen,
      scientific_name_present:      sciName,
      lot_code_matches_inside:      lotMatch,
      production_date_printed:      packed,
      best_before_date_printed:     bestBefore,
      supervisor_id:                user?.id ?? null,
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setPrimary10(''); setMaster40('');
    setOpen(false); await onSaved();
  }
  if (!open) return <button onClick={() => setOpen(true)} style={addBtn}>+ Master pack</button>;
  return (
    <div style={{ width: '100%', padding: 10, background: '#0a1628', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 8, marginTop: 6 }}>
      <p style={{ fontSize: 10, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>CCP-5 labeling — all 3 declarations must be ✓</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input value={primary10} onChange={(e) => setPrimary10(e.target.value)} placeholder="10lb primary boxes" type="number" min="0" style={miniInp} />
        <input value={master40} onChange={(e) => setMaster40(e.target.value)} placeholder="40lb master cartons" type="number" min="0" style={miniInp} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
        <CheckCcp v={sulfite} onChange={setSulfite} required>Sulfite declaration</CheckCcp>
        <CheckCcp v={allergen} onChange={setAllergen} required>Allergen declaration</CheckCcp>
        <CheckCcp v={lotMatch} onChange={setLotMatch} required>Lot code matches inside</CheckCcp>
        <CheckCcp v={sciName} onChange={setSciName}>Scientific name printed</CheckCcp>
        <CheckCcp v={packed} onChange={setPacked}>Production date printed</CheckCcp>
        <CheckCcp v={bestBefore} onChange={setBestBefore}>Best-before printed</CheckCcp>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} style={cancelBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ ...saveBtn, padding: '6px 14px' }}>✓ Save (CCP-5)</button>
      </div>
    </div>
  );
}

function CheckCcp({ v, onChange, required, children }: { v: boolean; onChange: (b: boolean) => void; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: required && !v ? '#f87171' : '#cbd5e1' }}>
      <input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} />
      {children}{required && <span style={{ color: '#f87171' }}>*</span>}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{k}</span>
      <span style={{ color: '#fff', fontWeight: 600 }}>{v}</span>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginBottom: 10 };
const lab: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 };
const row: React.CSSProperties = { display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' };
const emptyP: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: '6px 0' };
const addBtn: React.CSSProperties = { background: 'rgba(245,197,24,0.12)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const popoutForm: React.CSSProperties = { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' };
const miniInp: React.CSSProperties = { background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '4px 8px', fontSize: 12, flex: 1, minWidth: 0 };
const saveBtn: React.CSSProperties = { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
