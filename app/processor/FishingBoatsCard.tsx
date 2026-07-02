'use client';

// Fishing Boats card — the home for boats + their registration certificates.
// Processors see every boat (name · registration · captain · cert), add a new
// boat, and upload its registration certificate (private vessel-certs bucket).
// Feeds Card 1's boat dropdown via onBoatsChanged.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c', GOLD = '#c8860f';

interface Boat { id: string; vessel_code: string; vessel_name: string | null; fisherman_name: string; captain_name: string | null; license_number: string | null; color_tag: string | null; registration_cert_url: string | null; }
const COLS = 'id, vessel_code, vessel_name, fisherman_name, captain_name, license_number, color_tag, registration_cert_url';

export default function FishingBoatsCard({ onBoatsChanged }: { onBoatsChanged?: () => void }) {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''); const [reg, setReg] = useState(''); const [captain, setCaptain] = useState(''); const [cert, setCert] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('spinytails_vessels').select(COLS).order('vessel_name');
    setBoats((data ?? []) as Boat[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); }

  async function openCert(path: string | null) {
    if (!path) { flash(false, 'No cert on file for this boat.'); return; }
    if (/^https?:\/\//.test(path)) { window.open(path, '_blank'); return; }
    const { data, error } = await supabase.storage.from('vessel-certs').createSignedUrl(path, 3600);
    if (error || !data) { flash(false, 'Could not open cert.'); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function addBoat() {
    if (!name.trim() || !reg.trim()) { flash(false, 'Boat name + registration required.'); return; }
    const used = new Set(boats.map(b => b.vessel_code));
    const words = name.trim().toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
    let code = ((words[0]?.[0] ?? 'B') + (words[1]?.[0] ?? words[0]?.[1] ?? 'T')).replace(/[^A-Z]/g, 'X').slice(0, 2).padEnd(2, 'X');
    let i = 0; while (used.has(code) && i < 26) { code = code[0] + String.fromCharCode(65 + i); i++; }
    const palette = ['blue', 'green', 'orange', 'purple', 'yellow', 'red', 'black', 'white', 'pink', 'cyan', 'brown', 'gray'];
    const usedColors = new Set(boats.map(b => (b.color_tag || '').toLowerCase()));
    const color = palette.find(c => !usedColors.has(c)) ?? 'gray';
    setBusy(true);
    try {
      const { data: ins, error } = await supabase.from('spinytails_vessels').insert({
        vessel_code: code, vessel_name: name.trim(), fisherman_name: captain.trim() || name.trim(),
        captain_name: captain.trim() || null, license_number: reg.trim(), color_tag: color,
        status: 'approved', approved_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      const newId = (ins as { id: string }).id;
      if (cert) {
        const ext = (cert.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${code}/cert-${Date.now()}.${ext}`;
        const up = await supabase.storage.from('vessel-certs').upload(path, cert, { upsert: true, contentType: cert.type || undefined });
        if (!up.error) await supabase.from('spinytails_vessels').update({ registration_cert_url: path }).eq('id', newId);
        else flash(false, `Boat added, but cert upload failed: ${up.error.message}`);
      }
      await load(); onBoatsChanged?.();
      setName(''); setReg(''); setCaptain(''); setCert(null); setOpen(false);
      flash(true, `✓ Added ${name.trim()} (${code})`);
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Add boat failed'); }
    finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: 12, fontSize: 16, border: '1px solid #2a3a52', borderRadius: 10, marginTop: 6, background: '#0c1729', color: '#fff', boxSizing: 'border-box' };
  const card: React.CSSProperties = { background: '#0b1424', border: '1px solid rgba(200,134,15,0.25)', borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD }}>🚤 Fishing Boats <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· {boats.length}</span></div>
        <button onClick={() => setOpen(o => !o)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: `1px solid ${GOLD}`, background: 'transparent', color: GOLD, cursor: 'pointer' }}>{open ? '✕ Close' : '＋ Add boat'}</button>
      </div>

      {msg && <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, background: msg.ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', color: msg.ok ? '#4ade80' : '#f87171' }}>{msg.text}</div>}

      {open && (
        <div style={{ padding: 12, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Boat name *" style={inp} />
            <input value={reg} onChange={e => setReg(e.target.value)} placeholder="Registration # *" style={inp} />
            <input value={captain} onChange={e => setCaptain(e.target.value)} placeholder="Captain" style={inp} />
            <label style={{ ...inp, display: 'flex', alignItems: 'center', cursor: 'pointer', color: cert ? '#4ade80' : '#8ea3c0' }}>
              {cert ? `📄 ${cert.name.slice(0, 18)}` : '⬆ Registration cert (PDF/img)'}
              <input type="file" accept="image/*,application/pdf,.heic" onChange={e => setCert(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
            </label>
          </div>
          <button onClick={addBoat} disabled={busy} style={{ width: '100%', marginTop: 10, padding: 12, borderRadius: 10, fontWeight: 900, fontSize: 14, background: busy ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Saving…' : '✓ Save boat + cert'}</button>
        </div>
      )}

      {boats.length === 0 ? (
        <div style={{ color: '#8ea3c0', fontSize: 13 }}>No boats yet. Add your fishing boats and upload each registration certificate.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {boats.map(b => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44' }}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <b>{b.vessel_name ?? b.vessel_code}</b> <span style={{ color: '#5a6b85' }}>({b.vessel_code})</span>
                <div style={{ color: '#8ea3c0', fontSize: 12 }}>🪪 {b.license_number ?? 'no reg'} · 👤 {b.captain_name ?? b.fisherman_name}</div>
              </div>
              <button onClick={() => openCert(b.registration_cert_url)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 8, border: '1px solid', borderColor: b.registration_cert_url ? GOLD : '#2a3a52', background: 'transparent', color: b.registration_cert_url ? GOLD : '#5a6b85', cursor: 'pointer', whiteSpace: 'nowrap' }}>📄 {b.registration_cert_url ? 'View cert' : 'No cert'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
