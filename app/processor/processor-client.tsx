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
interface FeedRow { lot_code: string; species: string; status: string; created_at: string; boat: string; weight: number | null; who: string; }
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

  const vessel = useMemo(() => vessels.find(v => v.id === vesselId) || null, [vessels, vesselId]);

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

  useEffect(() => { (async () => {
    const { data: sp } = await supabase.from('spinytails_species').select('code, name').order('name');
    setSpecies((sp ?? []) as Species[]);
    await loadVessels(); await loadFeed();
  })(); }, [loadVessels, loadFeed]);

  useEffect(() => { if (vessel?.color_tag) setColorStrap(vessel.color_tag); }, [vessel]);

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); }

  async function viewCert() {
    const path = vessel?.registration_cert_url; if (!path) { flash(false, 'No cert on file for this boat.'); return; }
    if (/^https?:\/\//.test(path)) { window.open(path, '_blank'); return; }
    const { data, error } = await supabase.storage.from('vessel-certs').createSignedUrl(path, 3600);
    if (error || !data) { flash(false, 'Could not open cert.'); return; }
    window.open(data.signedUrl, '_blank');
  }

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
