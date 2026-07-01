'use client';

// /processor — Processor dashboard: REAL WORK ONLY.
// Primary flow "Take in product" (boat select + QC + accept/reject → batch
// number) + a live activity feed of what's actually happening. No task boards,
// no busywork — just the processing log the team creates.

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c', GOLD = '#c8860f';

interface Vessel { id: string; vessel_code: string; vessel_name: string | null; fisherman_name: string; captain_name: string | null; license_number: string | null; color_tag: string | null; }
interface Species { code: string; name: string; }
interface FeedRow { lot_code: string; species: string; status: string; created_at: string; boat: string; weight: number | null; who: string; }
type QC = { discoloration: boolean; egg_bearing: boolean; softshell_damage: boolean; undersized: boolean; odor: boolean };
const QC_FIELDS: { k: keyof QC; label: string }[] = [
  { k: 'discoloration', label: 'Discoloration' }, { k: 'egg_bearing', label: 'Egg-bearing' },
  { k: 'softshell_damage', label: 'Softshell / damage' }, { k: 'undersized', label: 'Undersized' }, { k: 'odor', label: 'Off-odor' },
];

export default function ProcessorClient({ displayName, role }: { userId: string; email: string; displayName: string | null; role: string; location: string | null }) {
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
  const [colorStrap, setColorStrap] = useState('');
  const [colorReused, setColorReused] = useState(false);
  const [qc, setQc] = useState<QC>({ discoloration: false, egg_bearing: false, softshell_damage: false, undersized: false, odor: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const vessel = useMemo(() => vessels.find(v => v.id === vesselId) || null, [vessels, vesselId]);

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
    const [{ data: vs }, { data: sp }] = await Promise.all([
      supabase.from('spinytails_vessels').select('id, vessel_code, vessel_name, fisherman_name, captain_name, license_number, color_tag').eq('status', 'approved').order('vessel_name'),
      supabase.from('spinytails_species').select('code, name').order('name'),
    ]);
    setVessels((vs ?? []) as Vessel[]); setSpecies((sp ?? []) as Species[]);
    await loadFeed();
  })(); }, [loadFeed]);

  useEffect(() => { if (vessel?.color_tag) setColorStrap(vessel.color_tag); }, [vessel]);

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); }

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
          total_weight_lbs: parseFloat(weight), num_bags: numBags ? parseInt(numBags, 10) : null,
          product_state: state, core_temp_f: temp ? parseFloat(temp) : null,
          purchase_cost: cost ? parseFloat(cost) : null,
          color_strap: colorStrap || null, color_strap_reused: colorReused,
          decision, receiving_qc: qc, device_id: 'PROCESSOR-DASHBOARD',
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(true, decision === 'reject'
        ? `⛔ ${j.batch_number} REJECTED → held/quarantine.`
        : `✓ Accepted — batch ${j.batch_number}${j.qc_pass ? '' : ' (⚠ CCP-1 flag — review)'}`);
      // reset per-batch fields, keep boat/species for the next bag
      setWeight(''); setCost(''); setTemp(''); setNumBags('');
      setQc({ discoloration: false, egg_bearing: false, softshell_damage: false, undersized: false, odor: false });
      await loadFeed();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Take-in failed'); }
    finally { setBusy(false); }
  }

  const first = (displayName || '').split(' ')[0] || 'there';
  const inp: React.CSSProperties = { width: '100%', padding: 13, fontSize: 16, border: '1px solid #2a3a52', borderRadius: 10, marginTop: 6, background: '#0c1729', color: '#fff', boxSizing: 'border-box' };
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

      {/* Take in product */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD, marginBottom: 8 }}>📥 Take in product</div>
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
          <div style={{ fontSize: 12, color: '#8ea3c0', marginTop: 8 }}>
            🪪 Reg {vessel.license_number ?? '—'} · 👤 Capt. {vessel.captain_name ?? vessel.fisherman_name} · 🎨 strap {colorStrap || '—'}
            <button onClick={() => setColorReused(r => !r)} style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1px solid', borderColor: colorReused ? GOLD : '#2a3a52', background: colorReused ? 'rgba(200,134,15,0.2)' : 'transparent', color: colorReused ? GOLD : '#8ea3c0', cursor: 'pointer' }}>{colorReused ? '♻ reused strap' : 'new strap'}</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 4 }}>
          <div><div style={lbl}>Weight (lb)</div><input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>Cost ($)</div><input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="purchase" style={inp} /></div>
          <div><div style={lbl}>Temp (°F)</div><input type="number" inputMode="decimal" value={temp} onChange={e => setTemp(e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-end' }}>
          {(['fresh', 'frozen'] as const).map(s => (
            <button key={s} onClick={() => setState(s)} style={{ flex: 1, padding: 12, borderRadius: 10, fontWeight: 800, border: '2px solid', borderColor: state === s ? GOLD : '#2a3a52', background: state === s ? 'rgba(200,134,15,0.15)' : 'transparent', color: state === s ? GOLD : '#8ea3c0' }}>{s === 'fresh' ? '❄ Fresh' : '🧊 Frozen'}</button>
          ))}
          <div style={{ flex: 1 }}><input type="number" inputMode="numeric" value={numBags} onChange={e => setNumBags(e.target.value)} placeholder="# bags" style={{ ...inp, marginTop: 0 }} /></div>
        </div>

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
          <button onClick={() => takeIn('accept')} disabled={busy} style={{ flex: 2, padding: 15, borderRadius: 12, fontWeight: 900, fontSize: 16, background: busy ? '#6b7280' : GOLD, color: NAVY, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Working…' : '✓ Accept + generate batch'}</button>
        </div>
      </div>

      {/* Live activity feed */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: GOLD }}>📡 Live activity</div>
          <button onClick={loadFeed} style={{ fontSize: 12, color: '#8ea3c0', background: 'transparent', border: 'none', cursor: 'pointer' }}>↻</button>
        </div>
        {feed.length === 0 && <div style={{ color: '#8ea3c0', fontSize: 14 }}>No intakes yet — take in the first batch above.</div>}
        {feed.map((f, i) => (
          <Link key={i} href={`/spinytails/batch/${encodeURIComponent(f.lot_code)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none', color: '#fff' }}>
            <span style={{ fontSize: 16 }}>{f.status === 'rejected' ? '⛔' : f.status === 'received' ? '📥' : '⚙️'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{f.who} · {f.weight != null ? `${f.weight} lb ` : ''}{f.species} from {f.boat}</div>
              <div style={{ fontSize: 11, color: '#8ea3c0' }}><span style={{ fontFamily: 'monospace', color: GOLD }}>{f.lot_code}</span> · <b style={{ textTransform: 'uppercase' }}>{f.status.replace(/_/g, ' ')}</b> · {new Date(f.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </Link>
        ))}
      </div>

      <Link href="/spinytails" style={{ display: 'block', textAlign: 'center', color: '#8ea3c0', fontSize: 12, padding: 10 }}>Vessels · Defrost · Grading · Freezer logs · Fisheries packet →</Link>
      {(role === 'founder' || role === 'co_founder' || role === 'control_admin' || role === 'manager') && (
        <div style={{ textAlign: 'center', color: '#5a6b85', fontSize: 11 }}>Oversight view</div>
      )}
    </div>
  );
}
