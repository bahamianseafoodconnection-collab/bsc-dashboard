'use client';

// /processor — Processor dashboard (card sequence). CARD 1: New raw product
// from boat — boat select (auto-attach registration cert + captain), inline
// add-boat, product/temp/weight/bags + catch location, auto batch code, save
// raw batch into the receiving freezer. Plus a live activity feed (founder-
// visible). Cards 2-8 follow.

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c', GOLD = '#c8860f';

interface Vessel { id: string; vessel_code: string; vessel_name: string | null; fisherman_name: string; captain_name: string | null; license_number: string | null; color_tag: string | null; registration_cert_url: string | null; }
interface Species { code: string; name: string; }
interface Supplier { id: string; code: string | null; name: string; }
interface SupProduct { sku: string; name: string; }
interface Loc { code: string; name: string; }
interface FeedRow { lot_code: string; species: string; status: string; created_at: string; boat: string; weight: number | null; who: string; }
interface ThawLog { reading_f: number | null; within_limit: boolean | null; logged_at: string | null; }
interface FreezerLot { lot_id: string; batch_number: string; status: string; receipt_date: string | null; date_pulled?: string | null; best_used_by?: string | null; thaw_logs?: ThawLog[]; product_name: string; species_name: string | null; catch_location: string | null; current_freezer: string | null; boat: string | null; captain: string | null; registration: string | null; registration_cert_url: string | null; received_lbs: number; removed_lbs: number; remaining_lbs: number; }
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
  // inline add-boat
  const [addOpen, setAddOpen] = useState(false);
  const [nbName, setNbName] = useState(''); const [nbReg, setNbReg] = useState(''); const [nbCaptain, setNbCaptain] = useState(''); const [nbCert, setNbCert] = useState<File | null>(null);
  // Card 2 — inventory intake (finished product from supplier)
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [invSupplierId, setInvSupplierId] = useState('');
  const [supProducts, setSupProducts] = useState<SupProduct[]>([]);
  const [invSku, setInvSku] = useState(''); const [invQty, setInvQty] = useState(''); const [invCost, setInvCost] = useState(''); const [invLoc, setInvLoc] = useState(''); const [invInvoice, setInvInvoice] = useState('');
  // Card 3 — remove from freezer
  const [freezerLots, setFreezerLots] = useState<FreezerLot[]>([]);
  const [pullLotId, setPullLotId] = useState('');
  const [pullFreezer, setPullFreezer] = useState<'Holding' | 'Blast'>('Holding');
  const [pullReason, setPullReason] = useState('');
  const [pullWeight, setPullWeight] = useState('');
  // Card 4 — thaw / defrost temperature log
  const [thawLots, setThawLots] = useState<FreezerLot[]>([]);
  const [thawLotId, setThawLotId] = useState('');
  const [thawReading, setThawReading] = useState('');

  const vessel = useMemo(() => vessels.find(v => v.id === vesselId) || null, [vessels, vesselId]);
  const pullLot = useMemo(() => freezerLots.find(l => l.lot_id === pullLotId) || null, [freezerLots, pullLotId]);
  const thawLot = useMemo(() => thawLots.find(l => l.lot_id === thawLotId) || null, [thawLots, thawLotId]);

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

  const fetchLots = useCallback(async (status?: string): Promise<FreezerLot[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`/api/processor/freezer-lots${qs}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({ ok: false }));
    return j.ok ? (j.lots as FreezerLot[]) : [];
  }, []);
  const loadFreezerLots = useCallback(async () => { setFreezerLots(await fetchLots()); }, [fetchLots]);
  const loadThawLots = useCallback(async () => { setThawLots(await fetchLots('thawing')); }, [fetchLots]);

  useEffect(() => { (async () => {
    const [{ data: sp }, { data: sup }, { data: locs }] = await Promise.all([
      supabase.from('spinytails_species').select('code, name').order('name'),
      supabase.from('suppliers').select('id, code, name').order('name'),
      supabase.from('inventory_locations').select('code, name').eq('is_active', true).order('name'),
    ]);
    setSpecies((sp ?? []) as Species[]);
    setSuppliers((sup ?? []) as Supplier[]); setLocations((locs ?? []) as Loc[]);
    await loadVessels(); await loadFeed(); await loadFreezerLots(); await loadThawLots();
  })(); }, [loadVessels, loadFeed, loadFreezerLots, loadThawLots]);

  useEffect(() => { if (vessel?.color_tag) setColorStrap(vessel.color_tag); }, [vessel]);

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

  async function addBoat() {
    if (!nbName.trim() || !nbReg.trim()) { flash(false, 'Boat name + registration required.'); return; }
    const used = new Set(vessels.map(v => v.vessel_code));
    const words = nbName.trim().toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
    let code = ((words[0]?.[0] ?? 'B') + (words[1]?.[0] ?? words[0]?.[1] ?? 'T')).replace(/[^A-Z]/g, 'X').slice(0, 2).padEnd(2, 'X');
    let i = 0; while (used.has(code) && i < 26) { code = code[0] + String.fromCharCode(65 + i); i++; }
    const palette = ['blue', 'green', 'orange', 'purple', 'yellow', 'red', 'black', 'white', 'pink', 'cyan', 'brown', 'gray'];
    const usedColors = new Set(vessels.map(v => (v.color_tag || '').toLowerCase()));
    const color = palette.find(c => !usedColors.has(c)) ?? 'gray';
    setBusy(true);
    try {
      const { data: ins, error } = await supabase.from('spinytails_vessels').insert({
        vessel_code: code, vessel_name: nbName.trim(), fisherman_name: nbCaptain.trim() || nbName.trim(),
        captain_name: nbCaptain.trim() || null, license_number: nbReg.trim(), color_tag: color,
        status: 'approved', approved_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      const newId = (ins as { id: string }).id;
      if (nbCert) {
        const ext = (nbCert.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${code}/cert-${Date.now()}.${ext}`;
        const up = await supabase.storage.from('vessel-certs').upload(path, nbCert, { upsert: true, contentType: nbCert.type || undefined });
        if (!up.error) await supabase.from('spinytails_vessels').update({ registration_cert_url: path }).eq('id', newId);
        else flash(false, `Boat added, but cert upload failed: ${up.error.message}`);
      }
      await loadVessels(); setVesselId(newId);
      setAddOpen(false); setNbName(''); setNbReg(''); setNbCaptain(''); setNbCert(null);
      flash(true, `✓ Added ${nbName.trim()} (${code})`);
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Add boat failed'); }
    finally { setBusy(false); }
  }

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
      await loadFreezerLots(); await loadThawLots(); await loadFeed();
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
      await loadThawLots();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Log failed'); }
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
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setAddOpen(o => !o)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: '1px solid #2a3a52', background: 'transparent', color: '#8ea3c0', cursor: 'pointer' }}>＋ Add new boat</button>
          {vessel && (
            <>
              <span style={{ fontSize: 12, color: '#8ea3c0' }}>🪪 {vessel.license_number ?? 'no reg'} · 👤 {vessel.captain_name ?? vessel.fisherman_name}</span>
              <button onClick={viewCert} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: '1px solid', borderColor: vessel.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: vessel.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer' }}>📄 {vessel.registration_cert_url ? 'View cert' : 'No cert'}</button>
              <button onClick={() => setColorReused(r => !r)} style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 999, border: '1px solid', borderColor: colorReused ? GOLD : '#2a3a52', background: colorReused ? 'rgba(200,134,15,0.2)' : 'transparent', color: colorReused ? GOLD : '#8ea3c0', cursor: 'pointer' }}>🎨 {colorStrap || '—'} {colorReused ? '♻' : ''}</button>
            </>
          )}
        </div>

        {addOpen && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px dashed #2a3a52', background: '#0a1220' }}>
            <div style={lbl}>Add new boat</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={nbName} onChange={e => setNbName(e.target.value)} placeholder="Boat name *" style={inp} />
              <input value={nbReg} onChange={e => setNbReg(e.target.value)} placeholder="Registration # *" style={inp} />
              <input value={nbCaptain} onChange={e => setNbCaptain(e.target.value)} placeholder="Captain" style={inp} />
              <label style={{ ...inp, display: 'flex', alignItems: 'center', cursor: 'pointer', color: nbCert ? '#4ade80' : '#8ea3c0' }}>
                {nbCert ? `📄 ${nbCert.name.slice(0, 18)}` : '⬆ Cert (PDF/img)'}
                <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => setNbCert(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <button onClick={addBoat} disabled={busy} style={{ marginTop: 8, width: '100%', padding: 11, borderRadius: 10, fontWeight: 900, background: GOLD, color: NAVY, border: 'none', cursor: 'pointer' }}>{busy ? 'Adding…' : '✓ Add boat + attach cert'}</button>
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
                <div>🦞 {pullLot.product_name}{pullLot.species_name && pullLot.species_name !== pullLot.product_name ? ` · ${pullLot.species_name}` : ''}</div>
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
                <div><b style={{ color: GOLD }}>{thawLot.batch_number}</b> · 🦞 {thawLot.product_name}</div>
                <div>🚤 {thawLot.boat ?? '—'} · 📅 Pulled {thawLot.date_pulled?.slice(0, 10) ?? '—'} · ⏳ Best used by {thawLot.best_used_by ?? '—'}</div>
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
