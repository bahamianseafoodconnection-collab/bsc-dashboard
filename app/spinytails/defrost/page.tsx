'use client';

// /spinytails/defrost — Lobster path, stage 1: Pull from holding + Defrost.
//
// PULL FROM HOLDING starts the expiry clock (Best Used By = date_pulled +
// species shelf life) and routes the lot: 'processing' → ice-bath defrost, or
// 'retail' → direct distribution (skip processing). While thawing, the ice bath
// (thaw_vat) core temp is logged HOURLY against 32°F ± tolerance.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const PROC_ROLES = ['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations'];

interface Lot {
  id: string; batch_number: string | null; lot_code: string; species_code: string | null;
  status: string; receipt_date: string; date_pulled: string | null; best_used_by: string | null;
  color_strap: string | null; vessel_id: string;
}
interface Vessel { id: string; vessel_name: string | null; fisherman_name: string; color_tag: string | null; }
interface TempRow { id: string; logged_at: string; reading_f: number; within_limit: boolean; action_if_fail: string | null; }

export default function DefrostPage() {
  const [auth, setAuth] = useState<'checking' | 'no' | 'forbidden' | 'ok'>('checking');
  const [lots, setLots] = useState<Lot[]>([]);
  const [vessels, setVessels] = useState<Record<string, Vessel>>({});
  const [sel, setSel] = useState<Lot | null>(null);
  const [temps, setTemps] = useState<TempRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // pull form
  const [pulledWeight, setPulledWeight] = useState('');
  const [destination, setDestination] = useState<'processing' | 'retail'>('processing');
  const [storageLoc, setStorageLoc] = useState('');
  // defrost temp
  const [reading, setReading] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuth('no'); return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof as { role?: string | null } | null)?.role ?? null;
      if (!role || !PROC_ROLES.includes(role)) { setAuth('forbidden'); return; }
      setAuth('ok');
      await loadLots();
    })();
  }, []);

  async function loadLots() {
    const { data } = await supabase.from('spinytails_lots')
      .select('id, batch_number, lot_code, species_code, status, receipt_date, date_pulled, best_used_by, color_strap, vessel_id')
      .in('status', ['received', 'in_receiving_freezer', 'thawing'])
      .order('receipt_date', { ascending: false });
    const rows = (data ?? []) as Lot[];
    setLots(rows);
    const vids = [...new Set(rows.map(r => r.vessel_id).filter(Boolean))];
    if (vids.length) {
      const { data: vs } = await supabase.from('spinytails_vessels').select('id, vessel_name, fisherman_name, color_tag').in('id', vids);
      const map: Record<string, Vessel> = {};
      (vs ?? []).forEach((v) => { map[(v as Vessel).id] = v as Vessel; });
      setVessels(map);
    }
  }

  async function loadTemps(lotId: string) {
    const { data } = await supabase.from('spinytails_temperature_logs')
      .select('id, logged_at, reading_f, within_limit, action_if_fail')
      .eq('lot_id', lotId).eq('location', 'thaw_vat')
      .order('logged_at', { ascending: false });
    setTemps((data ?? []) as TempRow[]);
  }

  function select(l: Lot) {
    setSel(l); setMsg(''); setErr(''); setReading('');
    setPulledWeight(''); setDestination('processing'); setStorageLoc('');
    void loadTemps(l.id);
  }

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ lot_id: sel!.id, batch_number: sel!.batch_number ?? sel!.lot_code, ...body }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      return j;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed'); return null;
    } finally { setBusy(false); }
  }

  async function doPull() {
    if (!(parseFloat(pulledWeight) > 0)) { setErr('Enter the pulled weight.'); return; }
    const j = await post({ action: 'pull', pulled_weight_lbs: parseFloat(pulledWeight), destination, storage_location: storageLoc || null });
    if (j) {
      setMsg(`✓ Pulled. Best Used By ${j.best_used_by} (${j.shelf_life_months} mo). ${destination === 'retail' ? '→ Direct distribution.' : '→ Defrost (ice bath).'}`);
      await loadLots();
      setSel((s) => s ? { ...s, status: destination === 'retail' ? 'in_distribution' : 'thawing', date_pulled: String(j.date_pulled), best_used_by: String(j.best_used_by) } : s);
    }
  }

  async function logTemp() {
    if (reading === '' || !Number.isFinite(parseFloat(reading))) { setErr('Enter the ice-bath temp.'); return; }
    const j = await post({ action: 'defrost_temp', reading_f: parseFloat(reading) });
    if (j) {
      setMsg(j.within_limit ? '✓ Logged — within 32°F range.' : '⚠ Logged — OUT OF RANGE. Add ice / adjust bath toward 32°F.');
      setReading('');
      await loadTemps(sel!.id);
    }
  }

  if (auth === 'checking') return <Center>Checking…</Center>;
  if (auth === 'no') return <Center>Sign in required. <Link href="/staff-login?next=/spinytails/defrost" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></Center>;
  if (auth === 'forbidden') return <Center>Processing staff only.</Center>;

  const pulled = !!sel?.date_pulled || sel?.status === 'thawing' || sel?.status === 'in_distribution';

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>🧊 Pull + Defrost</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      {msg && <div style={{ ...card, border: '2px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontWeight: 700 }}>{msg}</div>}
      {err && <div style={{ ...card, border: '2px solid #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>⚠ {err}</div>}

      {/* Lot picker */}
      <div style={card}>
        <div style={lbl}>Select a lot (received / thawing)</div>
        {lots.length === 0 && <div style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>No lots in holding. Receive a delivery first.</div>}
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {lots.map((l) => {
            const v = vessels[l.vessel_id];
            const active = sel?.id === l.id;
            return (
              <button key={l.id} onClick={() => select(l)} style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: `2px solid ${active ? '#0b1628' : '#e2e8f0'}`, background: active ? '#0b1628' : '#fff', color: active ? '#fff' : '#0b1628', cursor: 'pointer' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 16 }}>{l.batch_number ?? l.lot_code}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  {v ? (v.vessel_name ?? v.fisherman_name) : '—'} · {l.color_strap ? `🎨 ${l.color_strap} · ` : ''}
                  <b style={{ textTransform: 'uppercase' }}>{l.status}</b>{l.best_used_by ? ` · use by ${l.best_used_by}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {sel && !pulled && (
        <div style={card}>
          <div style={lbl}>1 · Pull from holding (starts expiry clock)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
            <div><div style={lbl}>Pulled weight (lb)</div><input type="number" inputMode="decimal" value={pulledWeight} onChange={(e) => setPulledWeight(e.target.value)} style={inp} /></div>
            <div><div style={lbl}>From location</div><input value={storageLoc} onChange={(e) => setStorageLoc(e.target.value)} placeholder="Receiving Freezer" style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {(['processing', 'retail'] as const).map((d) => (
              <button key={d} onClick={() => setDestination(d)} style={{ flex: 1, padding: 14, borderRadius: 10, fontWeight: 800, border: '2px solid', borderColor: destination === d ? '#0b1628' : '#cbd5e1', background: destination === d ? '#0b1628' : '#fff', color: destination === d ? '#fff' : '#0b1628' }}>
                {d === 'processing' ? '🏭 Processing (defrost)' : '🛒 BSC retail (direct)'}
              </button>
            ))}
          </div>
          <button onClick={doPull} disabled={busy} style={{ ...bigBtn, marginTop: 12 }}>{busy ? 'Working…' : '✓ Pull + set Best-Used-By'}</button>
        </div>
      )}

      {sel && pulled && sel.status !== 'in_distribution' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={lbl}>2 · Defrost — ice bath 32°F (log HOURLY)</div>
            {sel.best_used_by && <span style={{ fontSize: 11, color: '#64748b' }}>use by {sel.best_used_by}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <input type="number" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="ice-bath °F" style={{ ...inp, marginTop: 0, flex: 1 }} />
            <button onClick={logTemp} disabled={busy} style={{ ...bigBtn, width: 160, marginTop: 0 }}>{busy ? '…' : '＋ Log temp'}</button>
          </div>
          {temps.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={lbl}>Today&rsquo;s ice-bath log</div>
              {temps.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eef2f7', fontSize: 13 }}>
                  <span>{new Date(t.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontWeight: 800, color: t.within_limit ? '#15803d' : '#b91c1c' }}>{t.reading_f}°F {t.within_limit ? '✓' : '⚠ OUT'}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
            When defrost is complete, continue to devein → sleeve → blast (next station).
          </div>
        </div>
      )}

      {sel && sel.status === 'in_distribution' && (
        <div style={{ ...card, border: '2px solid #2563eb', background: '#eff6ff', color: '#1e3a8a', fontWeight: 700 }}>
          🛒 Routed to BSC retail (direct distribution) — skips processing. Best Used By {sel.best_used_by}.
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const inp: React.CSSProperties = { width: '100%', padding: '14px', fontSize: 16, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6 };
const bigBtn: React.CSSProperties = { width: '100%', padding: 16, fontSize: 16, fontWeight: 900, background: '#f5c518', color: '#0b1628', border: 'none', borderRadius: 12, cursor: 'pointer' };
