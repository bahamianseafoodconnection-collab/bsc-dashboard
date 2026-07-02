'use client';

// Front-of-dashboard "Record Freezer Temperature" card (not buried).
// Blast / Holding / Inventory freezers, 3×/day (morning / noon / evening).
// Shows which readings are still due today + flags out-of-range vs the HACCP
// ceiling (Blast ≤ −10°F, Holding & Inventory ≤ 0°F). Bahamas-local slots.
// Backed by /api/spinytails/freezer-temp → spinytails_temperature_logs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAVY = '#060e1c', GOLD = '#c8860f';

interface Slot { key: string; label: string; done: boolean; reading_f: number | null; within_limit: boolean | null; }
interface Freezer { code: string; label: string; maxF: number; target: number; done_count: number; last_reading_f: number | null; last_within: boolean | null; last_at: string | null; slots: Slot[]; }

export default function FreezerTempCard() {
  const [freezers, setFreezers] = useState<Freezer[]>([]);
  const [sel, setSel] = useState('');
  const [reading, setReading] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/spinytails/freezer-temp', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({ ok: false }));
    if (j.ok) setFreezers(j.freezers as Freezer[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); }

  const dueCount = useMemo(() => freezers.reduce((n, f) => n + f.slots.filter(s => !s.done).length, 0), [freezers]);
  const selFreezer = useMemo(() => freezers.find(f => f.code === sel) || null, [freezers, sel]);

  async function log() {
    if (!sel) { flash(false, 'Pick a freezer.'); return; }
    const r = parseFloat(reading);
    if (!Number.isFinite(r)) { flash(false, 'Enter the temperature.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/freezer-temp', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ freezer: sel, reading_f: r, notes: notes || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      flash(j.within_limit, `${j.within_limit ? '✓' : '⚠'} ${selFreezer?.label} ${r}°F logged${j.within_limit ? '' : ` — ABOVE ${selFreezer?.maxF}°F, corrective action`}`);
      setReading(''); setNotes('');
      await load();
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Log failed'); }
    finally { setBusy(false); }
  }

  const card: React.CSSProperties = { background: '#0b1424', border: `1px solid ${dueCount > 0 ? 'rgba(248,113,113,0.5)' : 'rgba(200,134,15,0.25)'}`, borderRadius: 14, padding: 16, marginBottom: 14 };
  const inp: React.CSSProperties = { width: '100%', padding: 12, fontSize: 16, border: '1px solid #2a3a52', borderRadius: 10, marginTop: 6, background: '#0c1729', color: '#fff', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#8ea3c0', textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: GOLD }}>🌡️ Record Freezer Temperature <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c0' }}>· 3× daily</span></div>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 14, background: dueCount > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.12)', color: dueCount > 0 ? '#f87171' : '#4ade80' }}>{dueCount > 0 ? `${dueCount} reading${dueCount > 1 ? 's' : ''} due` : 'all logged today ✓'}</span>
      </div>

      {msg && <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, background: msg.ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)', color: msg.ok ? '#4ade80' : '#f87171' }}>{msg.text}</div>}

      {/* Per-freezer today grid */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        {freezers.map(f => (
          <div key={f.code} style={{ padding: 10, borderRadius: 10, background: '#0c1729', border: '1px solid #1c2c44' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 13.5 }}>{f.label} <span style={{ color: '#8ea3c0', fontWeight: 600, fontSize: 12 }}>· ≤ {f.maxF}°F</span></b>
              {f.last_reading_f != null && <span style={{ fontSize: 12, fontWeight: 800, color: f.last_within === false ? '#f87171' : '#4ade80' }}>last {f.last_reading_f}°F{f.last_within === false ? ' ⚠' : ''}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {f.slots.map(s => (
                <span key={s.key} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 800, padding: '4px 6px', borderRadius: 8, background: s.done ? (s.within_limit === false ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.12)') : 'rgba(148,163,184,0.1)', color: s.done ? (s.within_limit === false ? '#f87171' : '#4ade80') : '#f5c518', border: s.done ? 'none' : '1px dashed #3a4a63' }}>
                  {s.label}: {s.done ? `${s.reading_f}°F${s.within_limit === false ? ' ⚠' : ' ✓'}` : 'due'}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><div style={lbl}>Freezer</div>
          <select value={sel} onChange={e => setSel(e.target.value)} style={inp}>
            <option value="">— freezer —</option>
            {freezers.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
          </select></div>
        <div><div style={lbl}>Temperature (°F){selFreezer ? ` · ≤ ${selFreezer.maxF}` : ''}</div>
          <input type="number" inputMode="decimal" value={reading} onChange={e => setReading(e.target.value)} style={inp} /></div>
      </div>
      <div><div style={lbl}>Note (only if out of range)</div><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="corrective action taken…" style={inp} /></div>
      <button onClick={log} disabled={busy || !sel} style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, fontWeight: 900, fontSize: 15, background: (busy || !sel) ? '#3a4a63' : GOLD, color: NAVY, border: 'none', cursor: (busy || !sel) ? 'not-allowed' : 'pointer' }}>{busy ? 'Working…' : '🌡️ Log freezer temperature'}</button>
    </div>
  );
}
