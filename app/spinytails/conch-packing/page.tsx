'use client';

// /spinytails/conch-packing — Conch path, final stage: clean-spec + master cases.
//
// After the 24h blast: log the walk-in pull temp + cleaned weight, choose the
// cleaning spec (80/90/95%), then pack into 15/20/50-lb master cases. Each case
// becomes one spinytails_cases row (product_type='conch') + an inventory 'in'
// movement into 0°F holding; the lot flips to 'mastered'. Each case prints a
// QUEEN CONCH label (cleaning spec + barcode + QR → trace page).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { printProductLabels } from '@/lib/spinytails-product-label';

export const dynamic = 'force-dynamic';

const PROC_ROLES = ['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations'];
const CLEAN_SPECS = [80, 90, 95];
const CASE_SIZES = [15, 20, 50]; // lb master cases

interface Lot {
  id: string; batch_number: string | null; lot_code: string; species_code: string | null;
  status: string; best_used_by: string | null; date_pulled: string | null; color_strap: string | null;
}

export default function ConchPackingPage() {
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [lots, setLots] = useState<Lot[]>([]);
  const [sel, setSel] = useState<Lot | null>(null);
  const [cleanPct, setCleanPct] = useState(90);
  const [cleanedWeight, setCleanedWeight] = useState('');
  const [walkinTemp, setWalkinTemp] = useState('');
  const [freezerLoc, setFreezerLoc] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ cases: { case_code: string; net_weight_lbs: number }[]; boxed: number; recv: number; yield_lbs: number; clean_pct: number } | null>(null);

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
      .select('id, batch_number, lot_code, species_code, status, best_used_by, date_pulled, color_strap')
      .eq('status', 'blast_freezing').order('receipt_date', { ascending: false });
    setLots((data ?? []) as Lot[]);
  }

  function select(l: Lot) {
    setSel(l); setErr(''); setDone(null); setCounts({}); setCleanPct(90); setCleanedWeight(''); setWalkinTemp(''); setFreezerLoc('');
  }

  const totals = CASE_SIZES.reduce((acc, sz) => {
    const n = parseInt(counts[sz] || '0', 10) || 0;
    return { cases: acc.cases + n, lbs: acc.lbs + n * sz };
  }, { cases: 0, lbs: 0 });

  async function submit() {
    if (!sel) return;
    const packs = CASE_SIZES.map((sz) => ({ net_weight_lbs: sz, count: parseInt(counts[sz] || '0', 10) || 0 })).filter((p) => p.count > 0);
    if (packs.length === 0) { setErr('Enter at least one case size with a count.'); return; }
    setErr(''); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/processing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          action: 'pack_conch', lot_id: sel.id, batch_number: sel.batch_number ?? sel.lot_code,
          conch_clean_pct: cleanPct, packs,
          cleaned_weight_lbs: cleanedWeight ? parseFloat(cleanedWeight) : null,
          walkin_temp_f: walkinTemp ? parseFloat(walkinTemp) : null,
          holding_freezer_location: freezerLoc || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDone({ cases: (j.cases ?? []) as { case_code: string; net_weight_lbs: number }[], boxed: j.boxed_lbs, recv: j.received_lbs, yield_lbs: j.yield_lbs, clean_pct: j.clean_pct });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Packing failed');
    } finally { setBusy(false); }
  }

  function printCaseLabels() {
    if (!done || !sel) return;
    const packedBy = sel.date_pulled ? String(sel.date_pulled).slice(0, 10) : new Date().toISOString().slice(0, 10);
    printProductLabels(done.cases.map((c) => ({
      productType: 'conch' as const,
      lotCode:     c.case_code,
      netWeight:   `${c.net_weight_lbs} lb`,
      cleaningSpec: `${done.clean_pct}% clean`,
      packedBy,
      bestUsedBy:  sel.best_used_by ?? undefined,
    })), { widthIn: 4, heightIn: 6 });
  }

  if (auth === 'checking') return <C>Checking…</C>;
  if (auth === 'no') return <C>Sign in required. <Link href="/staff-login?next=/spinytails/conch-packing" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></C>;
  if (auth === 'forbidden') return <C>Processing staff only.</C>;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>🐚 Conch Packing</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      {err && <div style={{ ...sec, border: '2px solid #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>⚠ {err}</div>}

      {!done && (
        <div style={sec}>
          <div style={lbl}>Select a blast-frozen conch batch (CON-…)</div>
          {lots.length === 0 && <div style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>No batches in blast freezing.</div>}
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
            <div style={lbl}>Clean to spec</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {CLEAN_SPECS.map((p) => (
                <button key={p} onClick={() => setCleanPct(p)} style={{ flex: 1, padding: 14, borderRadius: 10, fontWeight: 900, border: '2px solid', borderColor: cleanPct === p ? '#0b1628' : '#cbd5e1', background: cleanPct === p ? '#0b1628' : '#fff', color: cleanPct === p ? '#fff' : '#0b1628' }}>{p}%</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
              <div><div style={lbl}>Cleaned wt (lb)</div><input type="number" inputMode="decimal" value={cleanedWeight} onChange={(e) => setCleanedWeight(e.target.value)} style={inp} /></div>
              <div><div style={lbl}>Walk-in temp °F</div><input type="number" inputMode="decimal" value={walkinTemp} onChange={(e) => setWalkinTemp(e.target.value)} placeholder="optional" style={inp} /></div>
              <div><div style={lbl}>Holding (0°F)</div><input value={freezerLoc} onChange={(e) => setFreezerLoc(e.target.value)} placeholder="Rack 1" style={inp} /></div>
            </div>
          </div>

          <div style={sec}>
            <div style={lbl}>Master cases — # per size</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {CASE_SIZES.map((sz) => (
                <div key={sz} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#334155' }}>{sz} lb case</span>
                  <input type="number" inputMode="numeric" value={counts[sz] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [sz]: e.target.value }))} placeholder="0" style={{ ...inp, marginTop: 0, width: 90, textAlign: 'center' }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 800, color: '#0b1628' }}>{totals.cases} case{totals.cases === 1 ? '' : 's'} · {totals.lbs} lb · {cleanPct}% clean</div>
            <button onClick={submit} disabled={busy || totals.cases === 0} style={{ ...inp, background: busy || totals.cases === 0 ? '#94a3b8' : '#16a34a', color: '#fff', fontWeight: 900, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Packing…' : `✓ Pack ${totals.cases} case${totals.cases === 1 ? '' : 's'} → holding`}
            </button>
          </div>
        </>
      )}

      {done && (
        <div style={{ ...sec, border: '2px solid #16a34a', background: '#f0fdf4' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#166534' }}>✓ {done.cases.length} conch case{done.cases.length === 1 ? '' : 's'} ({done.clean_pct}%) → 0°F holding</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 15, flexWrap: 'wrap' }}>
            <span>Received <b>{done.recv} lb</b></span>
            <span>Boxed <b>{done.boxed} lb</b></span>
            <span>Yield loss <b>{done.yield_lbs} lb</b></span>
          </div>
          <button onClick={printCaseLabels} style={{ ...inp, background: '#0b1628', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>🖨 Print {done.cases.length} conch label{done.cases.length === 1 ? '' : 's'} (QR + barcode)</button>
          <button onClick={() => { setSel(null); setDone(null); }} style={{ ...inp, background: '#fff', color: '#0b1628', fontWeight: 800, border: '2px solid #cbd5e1', cursor: 'pointer' }}>Pack another batch</button>
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
