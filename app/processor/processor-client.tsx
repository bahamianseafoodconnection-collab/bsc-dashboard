'use client';

// /processor — Processor dashboard (card sequence). CARD 1: New raw product
// from boat — boat select (auto-attach registration cert + captain), inline
// add-boat, product/temp/weight/bags + catch location, auto batch code, save
// raw batch into the receiving freezer. Plus a live activity feed (founder-
// visible). Cards 2-8 follow.

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { printProductLabels, type ProductLabel } from '@/lib/spinytails-product-label';
import FreezerTempCard from './FreezerTempCard';
import FishingBoatsCard from './FishingBoatsCard';
import ProductsCard from './ProductsCard';

const NAVY = '#060e1c', GOLD = '#c8860f';

// lobster_grade enum → label (mirrors /spinytails/grading)
const LOBSTER_GRADES: { value: string; label: string }[] = [
  { value: '5oz', label: '5 oz' }, { value: '6oz', label: '6 oz' }, { value: '7oz', label: '7 oz' },
  { value: '8oz', label: '8 oz' }, { value: '9oz', label: '9 oz' },
  { value: '10_12oz', label: '10–12 oz' }, { value: '12_14oz', label: '12–14 oz' },
  { value: '14_16oz', label: '14–16 oz' }, { value: '16_20oz', label: '16–20 oz' },
  { value: '20oz_plus', label: '20 oz+' }, { value: 'not_for_export', label: 'Not for export' },
];
const CONCH_SIZES = [15, 20, 50];
const CONCH_CLEAN = [80, 90, 95];

interface Vessel { id: string; vessel_code: string; vessel_name: string | null; fisherman_name: string; captain_name: string | null; license_number: string | null; color_tag: string | null; registration_cert_url: string | null; }
interface Species { code: string; name: string; }
interface Supplier { id: string; code: string | null; name: string; }
interface SupProduct { sku: string; name: string; }
interface Loc { code: string; name: string; }
interface FeedRow { lot_code: string; species: string; status: string; created_at: string; boat: string; weight: number | null; who: string; }
interface ThawLog { reading_f: number | null; within_limit: boolean | null; logged_at: string | null; }
interface TimelineEvent { t: string; icon: string; text: string; ok: boolean | null; }
interface FreezerLot { lot_id: string; batch_number: string; status: string; receipt_date: string | null; date_pulled?: string | null; best_used_by?: string | null; thaw_logs?: ThawLog[]; product_name: string; species_code?: string | null; species_name: string | null; catch_location: string | null; current_freezer: string | null; boat: string | null; captain: string | null; registration: string | null; registration_cert_url: string | null; received_lbs: number; removed_lbs: number; remaining_lbs: number; }
const PULL_REASONS: { value: string; label: string; destination: 'processing' | 'retail' }[] = [
  { value: 'defrost_for_processing', label: '🧊 Defrost for processing', destination: 'processing' },
  { value: 'bsc_sales',              label: '🛒 BSC sales',             destination: 'retail' },
  { value: 'external_order',         label: '📦 External order',        destination: 'retail' },
];
type QC = { discoloration: boolean; egg_bearing: boolean; softshell_damage: boolean; undersized: boolean; odor: boolean };
const QC_FIELDS: { k: keyof QC; label: string }[] = [
  { k: 'discoloration', label: 'Discoloration' }, { k: 'egg_bearing', label: 'Egg-bearing' },
  { k: 'softshell_damage', label: 'Softshell / damage' }, { k: 'undersized', label: 'Undersized' }, { k: 'odor', label: 'Off-odor' },
];
const VESSEL_COLS = 'id, vessel_code, vessel_name, fisherman_name, captain_name, license_number, color_tag, registration_cert_url';

export default function ProcessorClient({ displayName }: { userId: string; email: string; displayName: string | null; role: string; location: string | null }) {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [vesselId, setVesselId] = useState('');
  const [speciesCode, setSpeciesCode] = useState('');
  const [weight, setWeight] = useState('');
  const [cost, setCost] = useState('');
  const [state, setState] = useState<'fresh' | 'frozen'>('fresh');
  const [temp, setTemp] = useState('');
  const [numBags, setNumBags] = useState('');
  const [wtPerBag, setWtPerBag] = useState('');
  const [catchLoc, setCatchLoc] = useState('');
  const [colorStrap, setColorStrap] = useState('');
  const [colorReused, setColorReused] = useState(false);
  const [qc, setQc] = useState<QC>({ discoloration: false, egg_bearing: false, softshell_damage: false, undersized: false, odor: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Card 2 — inventory intake (finished product from supplier)
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [invSupplierId, setInvSupplierId] = useState('');
  const [supProducts, setSupProducts] = useState<SupProduct[]>([]);
  const [invSku, setInvSku] = useState(''); const [invQty, setInvQty] = useState(''); const [invCost, setInvCost] = useState(''); const [invLoc, setInvLoc] = useState(''); const [invInvoice, setInvInvoice] = useState('');
  // Card 3 — remove from freezer
  const [allLots, setAllLots] = useState<FreezerLot[]>([]);
  const [pullLotId, setPullLotId] = useState('');
  const [pullFreezer, setPullFreezer] = useState<'Holding' | 'Blast'>('Holding');
  const [pullReason, setPullReason] = useState('');
  const [pullWeight, setPullWeight] = useState('');
  // Card 4 — thaw / defrost temperature log
  const [thawLotId, setThawLotId] = useState('');
  const [thawReading, setThawReading] = useState('');
  // Card 5 — deveining (bath temp required)
  const [deveinLotId, setDeveinLotId] = useState('');
  const [deveinTemp, setDeveinTemp] = useState('');
  const [deveinWeight, setDeveinWeight] = useState('');
  // Card 5b — conch cleaning (conch only)
  const [cleanLotId, setCleanLotId] = useState('');
  const [cleanPct, setCleanPct] = useState<number>(90);
  const [cleanWeight, setCleanWeight] = useState('');
  const [cleanTemp, setCleanTemp] = useState('');
  // Card 6 — sleeving (time/date stamp)
  const [sleeveLotId, setSleeveLotId] = useState('');
  const [sleeveWeight, setSleeveWeight] = useState('');
  // Card 7 — blast freezer (stage history + blast-in temp)
  const [blastLotId, setBlastLotId] = useState('');
  const [blastFreezer, setBlastFreezer] = useState('');
  const [blastTemp, setBlastTemp] = useState('');
  const [hist, setHist] = useState<TimelineEvent[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  // Card 8 — remove from blast → box + label → holding (final)
  const [masterLotId, setMasterLotId] = useState('');
  const [masterFreezer, setMasterFreezer] = useState('');
  const [masterSulfite, setMasterSulfite] = useState(false);
  const [lobsterCounts, setLobsterCounts] = useState<Record<string, string>>({});
  const [conchCleanPct, setConchCleanPct] = useState<number>(90);
  const [conchCounts, setConchCounts] = useState<Record<string, string>>({});
  const [madeCases, setMadeCases] = useState<{ case_code: string; grade?: string; net_weight_lbs?: number }[]>([]);
  const [pendingLabels, setPendingLabels] = useState<ProductLabel[]>([]);

  const vessel = useMemo(() => vessels.find(v => v.id === vesselId) || null, [vessels, vesselId]);
  // One fetch (allLots), three stage-scoped views. Card 3 shows product sitting
  // in a freezer; Cards 4/5/6 the thawing line; Card 8 the blast freezer.
  const freezerLots = useMemo(() => allLots.filter(l => l.status === 'in_receiving_freezer' || l.status === 'blast_freezing' || l.status === 'mastered'), [allLots]);
  const thawLots = useMemo(() => allLots.filter(l => l.status === 'thawing'), [allLots]);
  const blastDoneLots = useMemo(() => allLots.filter(l => l.status === 'blast_freezing'), [allLots]);
  const pullLot = useMemo(() => freezerLots.find(l => l.lot_id === pullLotId) || null, [freezerLots, pullLotId]);
  const thawLot = useMemo(() => thawLots.find(l => l.lot_id === thawLotId) || null, [thawLots, thawLotId]);
  const deveinLot = useMemo(() => thawLots.find(l => l.lot_id === deveinLotId) || null, [thawLots, deveinLotId]);
  const conchLots = useMemo(() => thawLots.filter(l => (l.species_code ?? '').toLowerCase().includes('con') || (l.species_name ?? '').toLowerCase().includes('conch') || l.batch_number.toUpperCase().startsWith('CON-')), [thawLots]);
  const cleanLot = useMemo(() => conchLots.find(l => l.lot_id === cleanLotId) || null, [conchLots, cleanLotId]);
  const sleeveLot = useMemo(() => thawLots.find(l => l.lot_id === sleeveLotId) || null, [thawLots, sleeveLotId]);
  const blastLot = useMemo(() => thawLots.find(l => l.lot_id === blastLotId) || null, [thawLots, blastLotId]);
  const masterLot = useMemo(() => blastDoneLots.find(l => l.lot_id === masterLotId) || null, [blastDoneLots, masterLotId]);
  const isConch = useMemo(() => {
    if (!masterLot) return false;
    return (masterLot.species_code ?? '').toLowerCase().includes('conch')
      || (masterLot.species_name ?? '').toLowerCase().includes('conch')
      || masterLot.batch_number.toUpperCase().startsWith('CON-');
  }, [masterLot]);

  const loadVessels = useCallback(async () => {
    const { data } = await supabase.from('spinytails_vessels').select(VESSEL_COLS).eq('status', 'approved').order('vessel_name');
    setVessels((data ?? []) as Vessel[]);
  }, []);

  const loadFeed = useCallback(async () => {
    const { data: lots } = await supabase.from('spinytails_lots')
      .select('id, lot_code, species_code, status, created_at, vessel_id')
      .order('created_at', { ascending: false }).limit(15);
    const rows = (lots ?? []) as { id: string; lot_code: string; species_code: string | null; status: string; created_at: string; vessel_id: string }[];
    const vids = [...new Set(rows.map(r => r.vessel_id).filter(Boolean))];
    const vmap = new Map<string, string>();
    if (vids.length) {
      const { data: vs } = await supabase.from('spinytails_vessels').select('id, vessel_name, fisherman_name').in('id', vids);
      (vs ?? []).forEach((v) => vmap.set((v as Vessel).id, (v as Vessel).vessel_name ?? (v as Vessel).fisherman_name));
    }
    const ids = rows.map(r => r.id);
    const wmap = new Map<string, { w: number | null; who: string }>();
    if (ids.length) {
      const { data: ints } = await supabase.from('spinytails_lot_intakes').select('lot_id, quantity_lbs, receiving_employee').in('lot_id', ids);
      const empIds = [...new Set(((ints ?? []) as { receiving_employee: string | null }[]).map(i => i.receiving_employee).filter(Boolean) as string[])];
      const emap = new Map<string, string>();
      if (empIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', empIds);
        (profs ?? []).forEach((p) => emap.set((p as { id: string }).id, (p as { full_name: string | null }).full_name ?? 'Staff'));
      }
      ((ints ?? []) as { lot_id: string; quantity_lbs: number | null; receiving_employee: string | null }[])
        .forEach(i => wmap.set(i.lot_id, { w: i.quantity_lbs, who: i.receiving_employee ? (emap.get(i.receiving_employee) ?? 'Staff') : 'Staff' }));
    }
    setFeed(rows.map(r => ({
      lot_code: r.lot_code, species: r.species_code ?? '', status: r.status, created_at: r.created_at,
      boat: vmap.get(r.vessel_id) ?? '—', weight: wmap.get(r.id)?.w ?? null, who: wmap.get(r.id)?.who ?? 'Staff',
    })));
  }, []);

  // Single request → every processor-relevant lot (all stages Cards 3-8 need),
  // grouped client-side by the memos above. Replaces 3 separate round-trips.
  const loadLots = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/processor/freezer-lots?status=in_receiving_freezer,thawing,blast_freezing,mastered', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({ ok: false }));
    setAllLots(j.ok ? (j.lots as FreezerLot[]) : []);
  }, []);

  // Active receiving products (spinytails_species) via the products API — fills
  // Card 1's product dropdown; refreshes when the Products card adds one.
  const loadSpecies = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/processor/products', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({ ok: false }));
    const list = (j.ok ? j.products : []) as { code: string; name: string; active: boolean }[];
    setSpecies(list.filter(p => p.active).map(p => ({ code: p.code, name: p.name })));
  }, []);

  useEffect(() => { (async () => {
    const [{ data: sup }, { data: locs }] = await Promise.all([
      supabase.from('suppliers').select('id, code, name').order('name'),
      supabase.from('inventory_locations').select('code, name').eq('is_active', true).order('name'),
    ]);
    setSuppliers((sup ?? []) as Supplier[]); setLocations((locs ?? []) as Loc[]);
    await loadSpecies(); await loadVessels(); await loadFeed(); await loadLots();
  })(); }, [loadSpecies, loadVessels, loadFeed, loadLots]);

  useEffect(() => { if (vessel?.color_tag) setColorStrap(vessel.color_tag); }, [vessel]);

  // Card 7: assemble the full stage history for the selected batch (reuse the
  // read-only batch-pull audit endpoint → merged, time-sorted timeline).
  useEffect(() => { (async () => {
    if (!blastLot) { setHist([]); return; }
    setHistLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/spinytails/batch-pull/${encodeURIComponent(blastLot.batch_number)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
      const j = await res.json().catch(() => ({ ok: false }));
      const s = (j.ok ? j.sections : {}) as Record<string, Array<Record<string, unknown>>>;
      const ev: TimelineEvent[] = [];
      const n = (v: unknown) => (v == null ? '?' : String(v));
      for (const r of s.receiving ?? []) ev.push({ t: n(r.intake_time), icon: '📥', text: `Received ${n(r.quantity_lbs)} lb ${n(r.product_state)} @ ${n(r.core_temp_f_at_receipt)}°F`, ok: true });
      for (const rm of s.freezer_removals ?? []) ev.push({ t: n(rm.removed_at), icon: '🧊', text: `Pulled ${n(rm.weight_removed_lbs)} lb (${n(rm.purpose)})${rm.storage_location ? ` — ${n(rm.storage_location)}` : ''}`, ok: true });
      for (const t of s.temperature ?? []) ev.push({ t: n(t.logged_at), icon: '🌡️', text: `${n(t.location).replace(/_/g, ' ')} ${n(t.reading_f)}°F`, ok: t.within_limit as boolean | null });
      for (const st of s.processing_steps ?? []) ev.push({ t: n(st.recorded_at), icon: '🔧', text: n(st.step_name), ok: true });
      setHist(ev.filter(e => e.t && e.t !== '?').sort((a, b) => (a.t < b.t ? -1 : 1)));
    } catch { setHist([]); }
    finally { setHistLoading(false); }
  })(); }, [blastLot]);

  // Card 2: load the selected supplier's products.
  useEffect(() => { (async () => {
    if (!invSupplierId) { setSupProducts([]); return; }
    const { data } = await supabase.from('products').select('sku, name').eq('primary_supplier_id', invSupplierId).order('name');
    setSupProducts((data ?? []) as SupProduct[]); setInvSku('');
  })(); }, [invSupplierId]);

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); }

  async function openCert(path: string | null) {
    if (!path) { flash(false, 'No cert on file for this boat.'); return; }
    if (/^https?:\/\//.test(path)) { window.open(path, '_blank'); return; }
    const { data, error } = await supabase.storage.from('vessel-certs').createSignedUrl(path, 3600);
    if (error || !data) { flash(false, 'Could not open cert.'); return; }
    window.open(data.signedUrl, '_blank');
  }
  const viewCert = () => openCert(vessel?.registration_cert_url ?? null);

  async function takeIn(decision: 'accept' | 'reject') {
    if (!vesselId) { flash(false, 'Select the boat.'); return; }
    if (!speciesCode) { flash(false, 'Select the product type.'); return; }
    if (!(parseFloat(weight) > 0)) { flash(false, 'Enter the weight.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/receive', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          vessel_id: vesselId, species_code: speciesCode, product_name: species.find(s => s.code === speciesCode)?.name,
          total_weight_lbs: parseFloat(weight), num_bags: numBags ? parseInt(numBags, 10) : null, weight_per_bag_lbs: wtPerBag ? parseFloat(wtPerBag) : null,
          product_state: state, core_temp_f: temp ? parseFloat(temp) : null, purchase_cost: cost ? parseFloat(cost) : null,
          fishing_area: catchLoc || null, color_strap: colorStrap || null, color_strap_reused: colorReused,
          decision, receiving_qc: qc, device_id: 'PROCESSOR-CARD-1',
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(true, decision === 'reject'
        ? `⛔ ${j.batch_number} REJECTED → held/quarantine.`
        : `✓ ${j.batch_number} → receiving freezer${j.qc_pass ? '' : ' (⚠ CCP-1 flag)'}`);
      setWeight(''); setCost(''); setTemp(''); setNumBags(''); setWtPerBag(''); setCatchLoc('');
      setQc({ discoloration: false, egg_bearing: false, softshell_damage: false, undersized: false, odor: false });
      await loadFeed();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Take-in failed'); }
    finally { setBusy(false); }
  }

  async function submitInventory() {
    if (!invSku) { flash(false, 'Select a product.'); return; }
    if (!(parseFloat(invQty) > 0)) { flash(false, 'Enter quantity.'); return; }
    if (!invLoc) { flash(false, 'Select a location.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supplier = suppliers.find(s => s.id === invSupplierId);
      const res = await fetch('/api/processor/inventory-in', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ sku: invSku, quantity: parseFloat(invQty), to_location_code: invLoc, supplier_code: supplier?.code ?? null, cost_per_unit: invCost ? parseFloat(invCost) : null, invoice_number: invInvoice || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(true, `✓ ${invQty} × ${supProducts.find(p => p.sku === invSku)?.name ?? invSku} → ${locations.find(l => l.code === invLoc)?.name}`);
      setInvQty(''); setInvCost(''); setInvInvoice(''); setInvSku('');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Intake failed'); }
    finally { setBusy(false); }
  }

  async function submitPull() {
    if (!pullLot) { flash(false, 'Select a batch.'); return; }
    if (!pullReason) { flash(false, 'Pick a reason.'); return; }
    const wt = parseFloat(pullWeight);
    if (!(wt > 0)) { flash(false, 'Enter weight to remove.'); return; }
    const reason = PULL_REASONS.find(r => r.value === pullReason);
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          action: 'pull', lot_id: pullLot.lot_id, batch_number: pullLot.batch_number,
          pulled_weight_lbs: wt, destination: reason?.destination ?? 'processing', reason: pullReason,
          storage_location: pullFreezer, product_name: pullLot.product_name, device_id: 'PROCESSOR-CARD-3',
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(true, `✓ Pulled ${wt} lb · ${pullLot.product_name} (${pullLot.batch_number}) from ${pullFreezer} — ${reason?.label.replace(/^\S+\s/, '')}`);
      setPullWeight(''); setPullReason(''); setPullLotId('');
      await loadLots(); await loadFeed();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Pull failed'); }
    finally { setBusy(false); }
  }

  async function submitThawTemp() {
    if (!thawLot) { flash(false, 'Select a thawing batch.'); return; }
    const reading = parseFloat(thawReading);
    if (!Number.isFinite(reading)) { flash(false, 'Enter the ice-bath temperature.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'defrost_temp', lot_id: thawLot.lot_id, batch_number: thawLot.batch_number, reading_f: reading, device_id: 'PROCESSOR-CARD-4' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(j.within_limit, `${j.within_limit ? '✓' : '⚠'} ${reading}°F logged · ${thawLot.batch_number}${j.within_limit ? ' (within 32°F ±3)' : ' — OUT of range, correct the bath'}`);
      setThawReading('');
      await loadLots();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Log failed'); }
    finally { setBusy(false); }
  }

  async function submitDevein() {
    if (!deveinLot) { flash(false, 'Select a batch.'); return; }
    const reading = parseFloat(deveinTemp);
    if (!Number.isFinite(reading)) { flash(false, 'Bath temperature is required.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'devein', lot_id: deveinLot.lot_id, batch_number: deveinLot.batch_number, reading_f: reading, weight_lbs: deveinWeight ? parseFloat(deveinWeight) : null, device_id: 'PROCESSOR-CARD-5' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(j.within_limit, `${j.within_limit ? '✓' : '⚠'} Deveining logged · ${deveinLot.batch_number} · bath ${reading}°F${j.within_limit ? '' : ' — ABOVE 40°F, chill the bath'}`);
      setDeveinTemp(''); setDeveinWeight('');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Deveining log failed'); }
    finally { setBusy(false); }
  }

  async function submitCleanConch() {
    if (!cleanLot) { flash(false, 'Select a conch batch.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'clean_conch', lot_id: cleanLot.lot_id, batch_number: cleanLot.batch_number, conch_clean_pct: cleanPct, weight_lbs: cleanWeight ? parseFloat(cleanWeight) : null, reading_f: cleanTemp ? parseFloat(cleanTemp) : null, device_id: 'PROCESSOR-CARD-5B' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(j.within_limit !== false, `✓ Conch cleaning ${cleanPct}% logged · ${cleanLot.batch_number}${j.within_limit === false ? ' (⚠ bath above 40°F)' : ''}`);
      setCleanWeight(''); setCleanTemp('');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Cleaning log failed'); }
    finally { setBusy(false); }
  }

  async function submitSleeve() {
    if (!sleeveLot) { flash(false, 'Select a batch.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'sleeve', lot_id: sleeveLot.lot_id, batch_number: sleeveLot.batch_number, weight_lbs: sleeveWeight ? parseFloat(sleeveWeight) : null, device_id: 'PROCESSOR-CARD-6' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(true, `✓ Sleeving logged · ${sleeveLot.batch_number} · ${sleeveLot.boat ?? '—'}`);
      setSleeveWeight('');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Sleeving log failed'); }
    finally { setBusy(false); }
  }

  async function submitBlast() {
    if (!blastLot) { flash(false, 'Select a batch.'); return; }
    const reading = parseFloat(blastTemp);
    if (!Number.isFinite(reading)) { flash(false, 'Blast-freezer temperature is required.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'blast_in', lot_id: blastLot.lot_id, batch_number: blastLot.batch_number, reading_f: reading, blast_freezer_location: blastFreezer || null, device_id: 'PROCESSOR-CARD-7' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(j.within_limit, `${j.within_limit ? '✓' : '⚠'} ${blastLot.batch_number} → blast freezing · ${reading}°F${j.within_limit ? '' : ' — ABOVE −10°F, do not start the 24h clock'}`);
      setBlastTemp(''); setBlastFreezer(''); setBlastLotId('');
      await loadLots(); await loadFeed();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Blast-in failed'); }
    finally { setBusy(false); }
  }

  function labelsFor(cases: { case_code: string; grade?: string; net_weight_lbs?: number }[], lot: FreezerLot, conch: boolean, sulfite: boolean): ProductLabel[] {
    const packedBy = (lot.date_pulled ? String(lot.date_pulled) : lot.receipt_date ?? '').slice(0, 10) || undefined;
    const gLabel = (v?: string) => LOBSTER_GRADES.find(g => g.value === v)?.label ?? v;
    return cases.map(c => conch
      ? { productType: 'conch' as const, lotCode: c.case_code, netWeight: `${c.net_weight_lbs ?? ''} lb`, cleaningSpec: `${conchCleanPct}% clean`, packedBy, bestUsedBy: lot.best_used_by ?? undefined }
      : { productType: 'lobster' as const, lotCode: c.case_code, netWeight: '10 lb case', size: gLabel(c.grade), packedBy, bestUsedBy: lot.best_used_by ?? undefined, sulfite });
  }

  async function submitMaster() {
    if (!masterLot) { flash(false, 'Select a batch.'); return; }
    const lot = masterLot, conch = isConch, sulfite = masterSulfite;
    let body: Record<string, unknown>;
    if (conch) {
      const packs = CONCH_SIZES.map(nw => ({ net_weight_lbs: nw, count: parseInt(conchCounts[String(nw)] || '0', 10) || 0 })).filter(p => p.count > 0);
      if (!packs.length) { flash(false, 'Enter at least one case size with a count.'); return; }
      body = { action: 'pack_conch', lot_id: lot.lot_id, batch_number: lot.batch_number, conch_clean_pct: conchCleanPct, packs, holding_freezer_location: masterFreezer || null, device_id: 'PROCESSOR-CARD-8' };
    } else {
      const grades = LOBSTER_GRADES.map(g => ({ grade: g.value, box_count: parseInt(lobsterCounts[g.value] || '0', 10) || 0 })).filter(g => g.box_count > 0);
      if (!grades.length) { flash(false, 'Enter at least one size with a box count.'); return; }
      body = { action: 'grade', lot_id: lot.lot_id, batch_number: lot.batch_number, product_type: 'lobster', grades, sulfite, holding_freezer_location: masterFreezer || null, device_id: 'PROCESSOR-CARD-8' };
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const cases = (j.cases ?? []) as { case_code: string; grade?: string; net_weight_lbs?: number }[];
      setMadeCases(cases);
      const labels = labelsFor(cases, lot, conch, sulfite);
      setPendingLabels(labels);
      flash(true, `✓ ${cases.length} case(s) · ${lot.batch_number} → holding, ready to ship. Printing labels…`);
      setLobsterCounts({}); setConchCounts({}); setMasterFreezer(''); setMasterLotId('');
      if (labels.length) await printProductLabels(labels, { widthIn: 4, heightIn: 6 });
      await loadLots(); await loadFeed();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Boxing failed'); }
    finally { setBusy(false); }
  }

  const first = (displayName || '').split(' ')[0] || 'there';
  const inp: React.CSSProperties = { width: '100%', padding: 12, fontSize: 16, border: '1px solid #2a3a52', borderRadius: 10, marginTop: 6, background: '#0c1729', color: '#fff', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#8ea3c0', textTransform: 'uppercase', letterSpacing: 0.5 };
  const card: React.CSSProperties = { background: '#0b1424', border: '1px solid rgba(200,134,15,0.25)', borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', background: NAVY, color: '#fff', fontFamily: 'system-ui, "DM Sans", sans-serif', padding: 16, maxWidth: 760, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, fontWeight: 800 }}>SPINY TAILS · PROCESSOR</div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, margin: '2px 0' }}>Hi {first} 🦞</h1>
        </div>
        <Link href="/spinytails" style={{ fontSize: 12, color: GOLD }}>Full station →</Link>
      </div>

      {msg && <div style={{ ...card, borderColor: msg.ok ? '#16a34a' : '#dc2626', background: msg.ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', color: msg.ok ? '#4ade80' : '#f87171', fontWeight: 700 }}>{msg.text}</div>}

      {/* FRONT-OF-DASHBOARD — record freezer temperature (3×/day, due-tracked) */}
      <FreezerTempCard />

      {/* SETUP — fishing boats + their registration certificates */}
      <FishingBoatsCard onBoatsChanged={loadVessels} />

      {/* SETUP — receiving products (fills Card 1's product dropdown) */}
      <ProductsCard onProductsChanged={loadSpecies} />

      {/* CARD 1 — New raw product from boat */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: GOLD }}>1 · 📥 New raw product from boat</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={lbl}>Boat</div>
            <select value={vesselId} onChange={e => setVesselId(e.target.value)} style={inp}>
              <option value="">— select boat —</option>
              {vessels.map(v => <option key={v.id} value={v.id}>{v.vessel_name ?? v.vessel_code} · {v.fisherman_name}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Product type</div>
            <select value={speciesCode} onChange={e => setSpeciesCode(e.target.value)} style={inp}>
              <option value="">— product —</option>
              {species.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {vessel && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#8ea3c0' }}>🪪 {vessel.license_number ?? 'no reg'} · 👤 {vessel.captain_name ?? vessel.fisherman_name}</span>
            <button onClick={viewCert} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: '1px solid', borderColor: vessel.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: vessel.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer' }}>📄 {vessel.registration_cert_url ? 'View cert' : 'No cert'}</button>
            <button onClick={() => setColorReused(r => !r)} style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 999, border: '1px solid', borderColor: colorReused ? GOLD : '#2a3a52', background: colorReused ? 'rgba(200,134,15,0.2)' : 'transparent', color: colorReused ? GOLD : '#8ea3c0', cursor: 'pointer' }}>🎨 {colorStrap || '—'} {colorReused ? '♻' : ''}</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
          <div><div style={lbl}>Weight (lb)</div><input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Cost ($)</div><input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Core temp (°F)</div><input type="number" inputMode="decimal" value={temp} onChange={e => setTemp(e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><div style={lbl}># Bags/bins</div><input type="number" inputMode="numeric" value={numBags} onChange={e => setNumBags(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Wt / bag (lb)</div><input type="number" inputMode="decimal" value={wtPerBag} onChange={e => setWtPerBag(e.target.value)} style={inp} /></div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            {(['fresh', 'frozen'] as const).map(s => (
              <button key={s} onClick={() => setState(s)} style={{ flex: 1, padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 12, border: '2px solid', borderColor: state === s ? GOLD : '#2a3a52', background: state === s ? 'rgba(200,134,15,0.15)' : 'transparent', color: state === s ? GOLD : '#8ea3c0' }}>{s === 'fresh' ? '❄' : '🧊'}</button>
            ))}
          </div>
        </div>
        <div><div style={lbl}>Catch location (area / GPS)</div><input value={catchLoc} onChange={e => setCatchLoc(e.target.value)} placeholder="e.g. Exuma Sound / 24.1, -76.3" style={inp} /></div>

        <div style={{ marginTop: 12 }}>
          <div style={lbl}>QC flags (tap any that apply)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {QC_FIELDS.map(({ k, label }) => (
              <button key={k} onClick={() => setQc(s => ({ ...s, [k]: !s[k] }))} style={{ padding: '8px 12px', borderRadius: 999, fontWeight: 800, fontSize: 12, border: '2px solid', borderColor: qc[k] ? '#dc2626' : '#2a3a52', background: qc[k] ? 'rgba(220,38,38,0.18)' : 'transparent', color: qc[k] ? '#f87171' : '#8ea3c0' }}>{qc[k] ? '⚠ ' : ''}{label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={() => takeIn('reject')} disabled={busy} style={{ flex: 1, padding: 15, borderRadius: 12, fontWeight: 900, fontSize: 15, background: 'transparent', color: '#f87171', border: '2px solid #dc2626', cursor: busy ? 'wait' : 'pointer' }}>⛔ Reject → hold</button>
          <button onClick={() => takeIn('accept')} disabled={busy} style={{ flex: 2, padding: 15, borderRadius: 12, fontWeight: 900, fontSize: 16, background: busy ? '#6b7280' : GOLD, color: NAVY, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Working…' : '✓ Accept → batch → freezer'}</button>
        </div>
      </div>

      {/* CARD 2 — inventory intake: finished product from supplier */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>2 · 📦 Inventory intake — finished product from supplier</div>
        {locations.length === 0 ? (
          <div style={{ color: '#fbbf24', fontSize: 13 }}>⚠ No inventory location set up yet — add one first (founder) before receiving supplier stock.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div style={lbl}>Supplier</div>
                <select value={invSupplierId} onChange={e => setInvSupplierId(e.target.value)} style={inp}><option value="">— supplier —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><div style={lbl}>Product</div>
                <select value={invSku} onChange={e => setInvSku(e.target.value)} style={inp} disabled={!invSupplierId}><option value="">{invSupplierId ? '— product —' : 'pick supplier first'}</option>{supProducts.map(p => <option key={p.sku} value={p.sku}>{p.name}</option>)}</select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><div style={lbl}>Quantity</div><input type="number" inputMode="decimal" value={invQty} onChange={e => setInvQty(e.target.value)} style={inp} /></div>
              <div><div style={lbl}>Cost / unit ($)</div><input type="number" inputMode="decimal" value={invCost} onChange={e => setInvCost(e.target.value)} placeholder="blank = current" style={inp} /></div>
              <div><div style={lbl}>Location</div><select value={invLoc} onChange={e => setInvLoc(e.target.value)} style={inp}><option value="">— where —</option>{locations.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
            </div>
            <div><div style={lbl}>Invoice # (optional)</div><input value={invInvoice} onChange={e => setInvInvoice(e.target.value)} style={inp} /></div>
            <button onClick={submitInventory} disabled={busy} style={{ width: '100%', marginTop: 10, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: busy ? '#6b7280' : GOLD, color: NAVY, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Working…' : '✓ Receive into inventory'}</button>
          </>
        )}
      </div>

      {/* CARD 3 — remove from freezer (Holding or Blast) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>3 · 🧊 Remove from freezer</div>
        {freezerLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>No batches in a freezer yet. Receive raw product (Card 1) — it lands here once it&apos;s in the receiving freezer.</div>
        ) : (
          <>
            <div style={lbl}>Batch</div>
            <select value={pullLotId} onChange={e => setPullLotId(e.target.value)} style={inp}>
              <option value="">— select batch —</option>
              {freezerLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name} · {l.remaining_lbs} lb left</option>)}
            </select>

            {pullLot && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: GOLD }}>{pullLot.batch_number}</b>
                  <button onClick={() => openCert(pullLot.registration_cert_url)} style={{ fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 8, border: '1px solid', borderColor: pullLot.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: pullLot.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer' }}>📄 {pullLot.registration_cert_url ? 'View cert' : 'No cert'}</button>
                </div>
                <div>🐟 {pullLot.product_name}{pullLot.species_name && pullLot.species_name !== pullLot.product_name ? ` · ${pullLot.species_name}` : ''}</div>
                <div>📅 Received {pullLot.receipt_date ?? '—'} · 🧊 {pullLot.current_freezer ?? 'freezer'} · {pullLot.status.replace(/_/g, ' ')}</div>
                <div>🚤 {pullLot.boat ?? '—'} · 👤 {pullLot.captain ?? '—'} · 🪪 {pullLot.registration ?? 'no reg'}</div>
                <div>📍 Catch: {pullLot.catch_location ?? '—'}</div>
                <div style={{ color: '#8ea3c0' }}>⚖️ {pullLot.received_lbs} lb received · {pullLot.removed_lbs} lb removed · <b style={{ color: '#4ade80' }}>{pullLot.remaining_lbs} lb remaining</b></div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div><div style={lbl}>From freezer</div>
                <select value={pullFreezer} onChange={e => setPullFreezer(e.target.value as 'Holding' | 'Blast')} style={inp}>
                  <option value="Holding">Holding</option><option value="Blast">Blast</option>
                </select></div>
              <div><div style={lbl}>Weight to remove (lb)</div><input type="number" inputMode="decimal" value={pullWeight} onChange={e => setPullWeight(e.target.value)} style={inp} /></div>
            </div>
            <div style={{ marginTop: 10 }}><div style={lbl}>Reason</div>
              <select value={pullReason} onChange={e => setPullReason(e.target.value)} style={inp}>
                <option value="">— why —</option>
                {PULL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select></div>
            <button onClick={submitPull} disabled={busy || !pullLotId} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !pullLotId) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !pullLotId) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '🧊 Remove from freezer'}</button>
          </>
        )}
      </div>

      {/* CARD 4 — thaw / defrost temperature log (ice bath, target 32°F) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>4 · 🌡️ Thaw / defrost log <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· ice bath, target 32°F ±3</span></div>
        {thawLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>Nothing thawing right now. Pull a batch in Card 3 with reason <b>Defrost for processing</b> — it lands here to log the ice-bath temperature.</div>
        ) : (
          <>
            <div style={lbl}>Thawing batch</div>
            <select value={thawLotId} onChange={e => setThawLotId(e.target.value)} style={inp}>
              <option value="">— select batch —</option>
              {thawLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name}</option>)}
            </select>

            {thawLot && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                <div><b style={{ color: GOLD }}>{thawLot.batch_number}</b> · 🐟 {thawLot.product_name} · ⚖️ {thawLot.remaining_lbs} lb</div>
                <div>🚤 {thawLot.boat ?? '—'} · 🪪 {thawLot.registration ?? 'no reg'} · 📅 Pulled {thawLot.date_pulled?.slice(0, 10) ?? '—'} · ⏳ Best used by {thawLot.best_used_by ?? '—'}</div>
                {(thawLot.thaw_logs?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #1c2c44' }}>
                    <div style={{ fontSize: 11, color: '#8ea3c0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Readings ({thawLot.thaw_logs!.length})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {thawLot.thaw_logs!.slice(0, 12).map((t, i) => (
                        <span key={i} title={t.logged_at?.slice(0, 16) ?? ''} style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 14, background: t.within_limit ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.14)', color: t.within_limit ? '#4ade80' : '#f87171' }}>{t.reading_f}°F</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 10 }}><div style={lbl}>Ice-bath temperature (°F)</div>
              <input type="number" inputMode="decimal" value={thawReading} onChange={e => setThawReading(e.target.value)} placeholder="e.g. 32" style={inp} /></div>
            <button onClick={submitThawTemp} disabled={busy || !thawLotId} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !thawLotId) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !thawLotId) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '🌡️ Log thaw temperature'}</button>
          </>
        )}
      </div>

      {/* CARD 5 — deveining (bath temp required) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>5 · 🔪 Deveining <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· bath temp required, keep ≤ 40°F</span></div>
        {thawLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>No batches ready to devein. A batch appears here once it&apos;s been pulled to defrost (Card 3 → thawing).</div>
        ) : (
          <>
            <div style={lbl}>Batch</div>
            <select value={deveinLotId} onChange={e => setDeveinLotId(e.target.value)} style={inp}>
              <option value="">— select batch —</option>
              {thawLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name}</option>)}
            </select>

            {deveinLot && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: GOLD }}>{deveinLot.batch_number}</b>
                  <button onClick={() => openCert(deveinLot.registration_cert_url)} style={{ fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 8, border: '1px solid', borderColor: deveinLot.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: deveinLot.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer' }}>📄 {deveinLot.registration_cert_url ? 'View cert' : 'No cert'}</button>
                </div>
                <div>🐟 {deveinLot.product_name} · ⚖️ {deveinLot.remaining_lbs} lb</div>
                <div>🚤 {deveinLot.boat ?? '—'} · 🪪 {deveinLot.registration ?? 'no reg'} · 📍 {deveinLot.catch_location ?? '—'}</div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div><div style={lbl}>Bath temp (°F) — required</div><input type="number" inputMode="decimal" value={deveinTemp} onChange={e => setDeveinTemp(e.target.value)} placeholder="≤ 40" style={inp} /></div>
              <div><div style={lbl}>Weight deveined (lb) — optional</div><input type="number" inputMode="decimal" value={deveinWeight} onChange={e => setDeveinWeight(e.target.value)} style={inp} /></div>
            </div>
            <button onClick={submitDevein} disabled={busy || !deveinLotId} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !deveinLotId) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !deveinLotId) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '🔪 Log deveining'}</button>
          </>
        )}
      </div>

      {/* CARD 5b — conch cleaning (conch batches only) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>5b · 🐚 Conch cleaning <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· conch only · clean spec + weight</span></div>
        {conchLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>No conch on the line. A conch batch appears here once it&apos;s pulled to defrost (Card 3 → thawing).</div>
        ) : (
          <>
            <div style={lbl}>Conch batch</div>
            <select value={cleanLotId} onChange={e => setCleanLotId(e.target.value)} style={inp}>
              <option value="">— select batch —</option>
              {conchLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name} · 🚤 {l.boat ?? '—'}</option>)}
            </select>

            {cleanLot && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                <div><b style={{ color: GOLD }}>{cleanLot.batch_number}</b> · 🐚 {cleanLot.product_name} · ⚖️ {cleanLot.remaining_lbs} lb · 🚤 {cleanLot.boat ?? '—'}</div>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <div style={lbl}>Cleaning spec</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {[80, 90, 95].map(p => (
                  <button key={p} onClick={() => setCleanPct(p)} style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 800, border: '1px solid', borderColor: cleanPct === p ? GOLD : '#2a3a52', background: cleanPct === p ? 'rgba(200,134,15,0.15)' : 'transparent', color: cleanPct === p ? GOLD : '#8ea3c0', cursor: 'pointer' }}>{p}% clean</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div><div style={lbl}>Weight cleaned (lb)</div><input type="number" inputMode="decimal" value={cleanWeight} onChange={e => setCleanWeight(e.target.value)} style={inp} /></div>
              <div><div style={lbl}>Bath temp (°F) — optional</div><input type="number" inputMode="decimal" value={cleanTemp} onChange={e => setCleanTemp(e.target.value)} placeholder="≤ 40" style={inp} /></div>
            </div>
            <button onClick={submitCleanConch} disabled={busy || !cleanLotId} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !cleanLotId) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !cleanLotId) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '🐚 Log conch cleaning'}</button>
          </>
        )}
      </div>

      {/* CARD 6 — sleeving (time/date stamp) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>6 · 🧴 Sleeving <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· time + date stamped</span></div>
        {thawLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>No batches on the line yet. A batch appears here once it&apos;s been pulled to defrost (Card 3 → thawing).</div>
        ) : (
          <>
            <div style={lbl}>Batch (boat)</div>
            <select value={sleeveLotId} onChange={e => setSleeveLotId(e.target.value)} style={inp}>
              <option value="">— select batch —</option>
              {thawLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name} · 🚤 {l.boat ?? '—'}</option>)}
            </select>

            {sleeveLot && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                <div><b style={{ color: GOLD }}>{sleeveLot.batch_number}</b> · 🐟 {sleeveLot.product_name} · ⚖️ {sleeveLot.remaining_lbs} lb</div>
                <div>🚤 {sleeveLot.boat ?? '—'} · 🪪 {sleeveLot.registration ?? 'no reg'}</div>
              </div>
            )}

            <div style={{ marginTop: 10 }}><div style={lbl}>Weight sleeved (lb) — optional</div><input type="number" inputMode="decimal" value={sleeveWeight} onChange={e => setSleeveWeight(e.target.value)} style={inp} /></div>
            <button onClick={submitSleeve} disabled={busy || !sleeveLotId} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !sleeveLotId) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !sleeveLotId) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '🧴 Log sleeving'}</button>
          </>
        )}
      </div>

      {/* CARD 7 — blast freezer (stage history + blast-in temp) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>7 · ❄️ Blast freezer <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· target ≤ −10°F to start the 24h clock</span></div>
        {thawLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>No batches ready to blast. A batch reaches here after defrost + processing (Card 3 → thawing).</div>
        ) : (
          <>
            <div style={lbl}>Batch (boat / origin)</div>
            <select value={blastLotId} onChange={e => setBlastLotId(e.target.value)} style={inp}>
              <option value="">— select batch —</option>
              {thawLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name} · 🚤 {l.boat ?? '—'}</option>)}
            </select>

            {blastLot && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: GOLD }}>{blastLot.batch_number}</b>
                  <button onClick={() => openCert(blastLot.registration_cert_url)} style={{ fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 8, border: '1px solid', borderColor: blastLot.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: blastLot.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer' }}>📄 {blastLot.registration_cert_url ? 'View cert' : 'No cert'}</button>
                </div>
                <div>🐟 {blastLot.product_name} · ⚖️ {blastLot.remaining_lbs} lb · 🚤 {blastLot.boat ?? '—'} · 🪪 {blastLot.registration ?? 'no reg'}</div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1c2c44' }}>
                  <div style={{ fontSize: 11, color: '#8ea3c0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Stage history {histLoading ? '· loading…' : `(${hist.length})`}</div>
                  {!histLoading && hist.length === 0 && <div style={{ color: '#5a6b85', fontSize: 12 }}>No prior stages logged.</div>}
                  {hist.map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: e.ok === false ? '#f87171' : '#cbd5e1', padding: '1px 0' }}>
                      <span style={{ color: '#5a6b85', minWidth: 92 }}>{e.t.slice(5, 16).replace('T', ' ')}</span>
                      <span>{e.icon} {e.text}{e.ok === false ? ' ⚠' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div><div style={lbl}>Blast freezer</div><input value={blastFreezer} onChange={e => setBlastFreezer(e.target.value)} placeholder="e.g. Blast Freezer #1" style={inp} /></div>
              <div><div style={lbl}>Blast temp (°F) — required</div><input type="number" inputMode="decimal" value={blastTemp} onChange={e => setBlastTemp(e.target.value)} placeholder="≤ −10" style={inp} /></div>
            </div>
            <button onClick={submitBlast} disabled={busy || !blastLotId} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !blastLotId) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !blastLotId) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '❄️ Record into blast freezer'}</button>
          </>
        )}
      </div>

      {/* CARD 8 — remove from blast → box + label → holding (final) */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>8 · 📦 Box + label → holding <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· final: cases, barcodes, ready-to-ship</span></div>
        {blastDoneLots.length === 0 ? (
          <div style={{ color: '#8ea3c0', fontSize: 13 }}>No batches in the blast freezer. A batch reaches here after Card 7 (blast freezing).</div>
        ) : (
          <>
            <div style={lbl}>Batch (from blast)</div>
            <select value={masterLotId} onChange={e => { setMasterLotId(e.target.value); setMadeCases([]); setPendingLabels([]); }} style={inp}>
              <option value="">— select batch —</option>
              {blastDoneLots.map(l => <option key={l.lot_id} value={l.lot_id}>{l.batch_number} · {l.product_name} · 🚤 {l.boat ?? '—'}</option>)}
            </select>

            {masterLot && (
              <>
                <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', fontSize: 13, lineHeight: 1.7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: GOLD }}>{masterLot.batch_number} · {isConch ? '🐚 Conch — clean & pack' : `📦 ${masterLot.product_name} — grade & box`}</b>
                    <button onClick={() => openCert(masterLot.registration_cert_url)} style={{ fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 8, border: '1px solid', borderColor: masterLot.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: masterLot.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer' }}>📄 {masterLot.registration_cert_url ? 'View cert' : 'No cert'}</button>
                  </div>
                  <div>{masterLot.product_name} · ⚖️ {masterLot.remaining_lbs} lb · 🚤 {masterLot.boat ?? '—'} · 🪪 {masterLot.registration ?? 'no reg'} · 📍 {masterLot.catch_location ?? '—'}</div>
                </div>

                {isConch ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={lbl}>Cleaning spec</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {CONCH_CLEAN.map(p => (
                        <button key={p} onClick={() => setConchCleanPct(p)} style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 800, border: '1px solid', borderColor: conchCleanPct === p ? GOLD : '#2a3a52', background: conchCleanPct === p ? 'rgba(200,134,15,0.15)' : 'transparent', color: conchCleanPct === p ? GOLD : '#8ea3c0', cursor: 'pointer' }}>{p}% clean</button>
                      ))}
                    </div>
                    <div style={{ ...lbl, marginTop: 10 }}>Cases by size — enter count</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 6 }}>
                      {CONCH_SIZES.map(nw => (
                        <div key={nw}><div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 2 }}>{nw} lb</div>
                          <input type="number" inputMode="numeric" value={conchCounts[String(nw)] ?? ''} onChange={e => setConchCounts(c => ({ ...c, [String(nw)]: e.target.value }))} placeholder="0" style={inp} /></div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <div style={lbl}>Boxes by grade — enter count (10 lb each)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                      {LOBSTER_GRADES.map(g => (
                        <div key={g.value}><div style={{ fontSize: 11.5, color: '#cbd5e1', marginBottom: 2 }}>{g.label}</div>
                          <input type="number" inputMode="numeric" value={lobsterCounts[g.value] ?? ''} onChange={e => setLobsterCounts(c => ({ ...c, [g.value]: e.target.value }))} placeholder="0" style={{ ...inp, marginTop: 0, padding: 9 }} /></div>
                      ))}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={masterSulfite} onChange={e => setMasterSulfite(e.target.checked)} /> Sodium Metabisulfite used (label declaration)
                    </label>
                  </div>
                )}

                <div style={{ marginTop: 10 }}><div style={lbl}>Holding freezer</div><input value={masterFreezer} onChange={e => setMasterFreezer(e.target.value)} placeholder="e.g. Holding Freezer #1" style={inp} /></div>
                <button onClick={submitMaster} disabled={busy} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: busy ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Working…' : '📦 Box, label + move to holding'}</button>
              </>
            )}

            {madeCases.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(22,163,74,0.10)', border: '1px solid #16a34a', fontSize: 13 }}>
                <div style={{ fontWeight: 800, color: '#4ade80' }}>✓ {madeCases.length} case(s) made → holding, ready to ship</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '6px 0' }}>{madeCases.slice(0, 30).map((c, i) => <span key={i} style={{ fontSize: 11, background: '#0d1f3c', borderRadius: 12, padding: '2px 7px', color: '#cbd5e1' }}>{c.case_code}</span>)}</div>
                <button onClick={() => pendingLabels.length && printProductLabels(pendingLabels, { widthIn: 4, heightIn: 6 })} style={{ marginTop: 4, padding: '8px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13, background: 'transparent', border: `1px solid ${GOLD}`, color: GOLD, cursor: 'pointer' }}>🖨️ Print labels again</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Live activity feed (founder-visible) */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: GOLD }}>📡 Live activity</div>
          <button onClick={loadFeed} style={{ fontSize: 12, color: '#8ea3c0', background: 'transparent', border: 'none', cursor: 'pointer' }}>↻</button>
        </div>
        {feed.length === 0 && <div style={{ color: '#8ea3c0', fontSize: 14 }}>No intakes yet — take in the first batch above.</div>}
        {feed.map((f, i) => (
          <Link key={i} href={`/spinytails/batch/${encodeURIComponent(f.lot_code)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none', color: '#fff' }}>
            <span style={{ fontSize: 16 }}>{f.status === 'rejected' ? '⛔' : f.status === 'in_receiving_freezer' ? '🧊' : '⚙️'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{f.who} · {f.weight != null ? `${f.weight} lb ` : ''}{f.species} from {f.boat}</div>
              <div style={{ fontSize: 11, color: '#8ea3c0' }}><span style={{ fontFamily: 'monospace', color: GOLD }}>{f.lot_code}</span> · <b style={{ textTransform: 'uppercase' }}>{f.status.replace(/_/g, ' ')}</b> · {new Date(f.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </Link>
        ))}
      </div>

      <Link href="/spinytails" style={{ display: 'block', textAlign: 'center', color: '#8ea3c0', fontSize: 12, padding: 10 }}>Defrost · Grading · Freezer logs · Fisheries packet →</Link>
    </div>
  );
}
