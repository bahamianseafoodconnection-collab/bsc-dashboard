'use client';

// /spinytails/grading — Lobster path, stage 3: Walk-in grading → box → holding.
//
// Day 2, after the 24h blast: pull trays from the blast freezer, log the
// walk-in pull temp, GRADE by size (count boxes per size), then box into 10-lb
// cases. Each box becomes one spinytails_cases row (per-box traceability) +
// an inventory 'in' movement into 0°F holding; the lot flips to 'mastered'.
// YIELD = received − boxed. Each case prints its own label.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { printLabels } from '@/lib/label-print';

export const dynamic = 'force-dynamic';

const PROC_ROLES = ['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations'];

// lobster_grade enum values (DB) → display label.
const GRADES: { value: string; label: string }[] = [
  { value: '5oz', label: '5 oz' }, { value: '6oz', label: '6 oz' }, { value: '7oz', label: '7 oz' },
  { value: '8oz', label: '8 oz' }, { value: '9oz', label: '9 oz' },
  { value: '10_12oz', label: '10–12 oz' }, { value: '12_14oz', label: '12–14 oz' },
  { value: '14_16oz', label: '14–16 oz' }, { value: '16_20oz', label: '16–20 oz' },
  { value: '20oz_plus', label: '20 oz+' }, { value: 'not_for_export', label: 'Not for export' },
];

interface Lot {
  id: string; batch_number: string | null; lot_code: string; species_code: string | null;
  status: string; best_used_by: string | null; color_strap: string | null; vessel_id: string;
}

export default function GradingPage() {
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [lots, setLots] = useState<Lot[]>([]);
  const [sel, setSel] = useState<Lot | null>(null);
  const [boat, setBoat] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [walkinTemp, setWalkinTemp] = useState('');
  const [freezerLoc, setFreezerLoc] = useState('');
  const [sulfite, setSulfite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ cases: { case_code: string; grade: string }[]; boxed: number; recv: number; yield_lbs: number } | null>(null);

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    if (!role || !PROC_ROLES.includes(role)) { setAuth('forbidden'); return; }
    setAuth('ok'); await load();
  })(); }, []);

  async function load() {
    const { data } = await supabase.from('spinytails_lots')
      .select('id, batch_number, lot_code, species_code, status, best_used_by, color_strap, vessel_id')
      .eq('status', 'blast_freezing').order('receipt_date', { ascending: false });
    setLots((data ?? []) as Lot[]);
  }

  async function select(l: Lot) {
    setSel(l); setErr(''); setDone(null); setCounts({}); setWalkinTemp(''); setFreezerLoc(''); setSulfite(false); setBoat('');
    if (l.vessel_id) {
      const { data: v } = await supabase.from('spinytails_vessels').select('vessel_name, fisherman_name').eq('id', l.vessel_id).maybeSingle<{ vessel_name: string | null; fisherman_name: string }>();
      if (v) setBoat(v.vessel_name ?? v.fisherman_name);
    }
  }

  const totals = GRADES.reduce((acc, g) => {
    const n = parseInt(counts[g.value] || '0', 10) || 0;
    return { boxes: acc.boxes + n, lbs: acc.lbs + n * 10 };
  }, { boxes: 0, lbs: 0 });

  async function submit() {
    if (!sel) return;
    const grades = GRADES.map((g) => ({ grade: g.value, box_count: parseInt(counts[g.value] || '0', 10) || 0 })).filter((g) => g.box_count > 0);
    if (grades.length === 0) { setErr('Enter at least one size with a box count.'); return; }
    setErr(''); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          action: 'grade', lot_id: sel.id, batch_number: sel.batch_number ?? sel.lot_code,
          product_type: 'lobster', grades, sulfite,
          walkin_temp_f: walkinTemp ? parseFloat(walkinTemp) : null,
          holding_freezer_location: freezerLoc || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDone({ cases: (j.cases ?? []) as { case_code: string; grade: string }[], boxed: j.boxed_lbs, recv: j.received_lbs, yield_lbs: j.yield_lbs });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Grading failed');
    } finally { setBusy(false); }
  }

  function printCaseLabels() {
    if (!done || !sel) return;
    const gLabel = (v: string) => GRADES.find((g) => g.value === v)?.label ?? v;
    const labels = done.cases.map((c) => ({
      title: 'LOBSTER CASE', product_name: 'Spiny Lobster Tail', batch_number: c.case_code,
      weight: '10 lb', date: new Date().toLocaleDateString('en-US'), supplier: boat,
      extra: [
        { label: 'Size', value: gLabel(c.grade) },
        ...(sel.best_used_by ? [{ label: 'Best Used By', value: sel.best_used_by }] : []),
        ...(sulfite ? [{ label: 'Contains', value: 'SULFITES' }] : []),
        ...(sel.color_strap ? [{ label: 'Color strap', value: sel.color_strap }] : []),
      ],
    }));
    printLabels(labels, { widthIn: 4, heightIn: 6 });
  }

  if (auth === 'checking') return <C>Checking…</C>;
  if (auth === 'no') return <C>Sign in required. <Link href="/staff-login?next=/spinytails/grading" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></C>;
  if (auth === 'forbidden') return <C>Processing staff only.</C>;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>📏 Walk-in Grading</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      {err && <div style={{ ...sec, border: '2px solid #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>⚠ {err}</div>}

      {!done && (
        <div style={sec}>
          <div style={lbl}>Select a blast-frozen batch (24h complete)</div>
          {lots.length === 0 && <div style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>No batches in blast freezing. Complete processing → blast first.</div>}
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {lots.map((l) => {
              const active = sel?.id === l.id;
              return (
                <button key={l.id} onClick={() => select(l)} style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: `2px solid ${active ? '#0b1628' : '#e2e8f0'}`, background: active ? '#0b1628' : '#fff', color: active ? '#fff' : '#0b1628', cursor: 'pointer' }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 16 }}>{l.batch_number ?? l.lot_code}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{l.color_strap ? `🎨 ${l.color_strap} · ` : ''}{l.best_used_by ? `use by ${l.best_used_by}` : ''}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sel && !done && (
        <>
          <div style={sec}>
            <div style={lbl}>Walk-in pull</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
              <div><div style={lbl}>Walk-in temp (°F)</div><input type="number" inputMode="decimal" value={walkinTemp} onChange={(e) => setWalkinTemp(e.target.value)} placeholder="optional" style={inp} /></div>
              <div><div style={lbl}>Holding freezer (0°F)</div><input value={freezerLoc} onChange={(e) => setFreezerLoc(e.target.value)} placeholder="Holding Freezer · Rack 1" style={inp} /></div>
            </div>
            <button onClick={() => setSulfite((s) => !s)}
              style={{ width: '100%', marginTop: 10, padding: 12, borderRadius: 10, fontWeight: 800, border: '2px solid', borderColor: sulfite ? '#d97706' : '#cbd5e1', background: sulfite ? '#fef3c7' : '#fff', color: sulfite ? '#b45309' : '#475569', cursor: 'pointer' }}>
              {sulfite ? '⚠ CONTAINS SULFITES (metabisulfite) — on the label' : 'No sulfite (tap if metabisulfite used)'}
            </button>
          </div>

          <div style={sec}>
            <div style={lbl}>Grade by size — # of 10-lb cases</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              {GRADES.map((g) => (
                <div key={g.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#334155' }}>{g.label}</span>
                  <input type="number" inputMode="numeric" value={counts[g.value] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [g.value]: e.target.value }))} placeholder="0" style={{ ...inp, marginTop: 0, width: 80, textAlign: 'center' }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 800, color: '#0b1628' }}>
              {totals.boxes} case{totals.boxes === 1 ? '' : 's'} · {totals.lbs} lb boxed
            </div>
            <button onClick={submit} disabled={busy || totals.boxes === 0} style={{ ...inp, background: busy || totals.boxes === 0 ? '#94a3b8' : '#16a34a', color: '#fff', fontWeight: 900, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Boxing…' : `✓ Box ${totals.boxes} case${totals.boxes === 1 ? '' : 's'} → holding`}
            </button>
          </div>
        </>
      )}

      {done && (
        <div style={{ ...sec, border: '2px solid #16a34a', background: '#f0fdf4' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#166534' }}>✓ {done.cases.length} case{done.cases.length === 1 ? '' : 's'} boxed → 0°F holding</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 15, flexWrap: 'wrap' }}>
            <span>Received <b>{done.recv} lb</b></span>
            <span>Boxed <b>{done.boxed} lb</b></span>
            <span>Yield loss <b>{done.yield_lbs} lb</b></span>
          </div>
          <button onClick={printCaseLabels} style={{ ...inp, background: '#0b1628', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>🖨 Print {done.cases.length} case label{done.cases.length === 1 ? '' : 's'} (per box · QR + barcode)</button>
          <button onClick={() => { setSel(null); setDone(null); }} style={{ ...inp, background: '#fff', color: '#0b1628', fontWeight: 800, border: '2px solid #cbd5e1', cursor: 'pointer' }}>Grade another batch</button>
        </div>
      )}
    </div>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const inp: React.CSSProperties = { width: '100%', padding: 13, fontSize: 16, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6, boxSizing: 'border-box' };
