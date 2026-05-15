'use client';

// app/yield-measure/page.tsx
//
// Build #4 - Yield Measurement. Operates on real lot intakes from
// /lobster-intake (and any other yield_lots row). Lets staff record
// the actual measured output of a processing batch:
//   - finished_weight_lb (saleable weight after process)
//   - waste_weight_lb
//   - output_breakdown (per-grade for lobster tails)
//   - processed_by + processing_notes
//
// On save, computes:
//   - yield_pct = finished_weight_lb / received_weight_lb
//   - true_cost_per_lb = cost_paid / finished_weight_lb
//
// Honors the YIELD DISCIPLINE PRINCIPLE: no defaults, no assumptions.
// Staff must enter real measured numbers from the actual batch.
//
// Inline-styled (back-office). Mobile-friendly so processors can
// enter at the bench.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

const TAIL_SIZES = ['5oz', '6oz', '7oz', '8oz', '9oz', '10/12oz', '12/14oz', '14/16oz'];

type Lot = {
  id: string;
  lot_number: string | null;
  received_date: string | null;
  product_type: string | null;
  source_type: string | null;
  island_source: string | null;
  captain_name: string | null;
  boat_reg: string | null;
  whole_weight_lb: number | null;
  clean_weight_lb: number | null;
  cost_paid: number | null;
  true_cost_per_lb: number | null;
  size_grade_breakdown: Record<string, number> | null;
  intake_notes: string | null;
  finished_weight_lb: number | null;
  waste_weight_lb: number | null;
  output_breakdown: Record<string, number> | null;
  yield_pct: number | null;
  processed_at: string | null;
  processed_by: string | null;
  processing_notes: string | null;
  supplier_id: string | null;
  supplier?: { name: string } | { name: string }[] | null;
};

export default function YieldMeasurePage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [me, setMe] = useState<string>('');

  // Edit form state
  const [finishedWeight, setFinishedWeight] = useState('');
  const [wasteWeight, setWasteWeight] = useState('');
  const [outputGrades, setOutputGrades] = useState<Record<string, string>>({});
  const [procNotes, setProcNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); loadMe(); }, []);

  async function loadMe() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    setMe((prof?.full_name as string) || user.email || 'Staff');
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('yield_lots')
      .select(`
        id, lot_number, received_date, product_type, source_type,
        island_source, captain_name, boat_reg, whole_weight_lb,
        clean_weight_lb, cost_paid, true_cost_per_lb,
        size_grade_breakdown, intake_notes,
        finished_weight_lb, waste_weight_lb, output_breakdown,
        yield_pct, processed_at, processed_by, processing_notes,
        supplier_id, supplier:suppliers ( name )
      `)
      .order('processed_at', { ascending: false, nullsFirst: true })
      .order('received_date', { ascending: false, nullsFirst: false })
      .limit(100);
    if (err) {
      setError(plainError(err));
      setLots([]);
    } else {
      setLots(((data || []) as Array<Lot>).map((l) => ({
        ...l,
        supplier: Array.isArray(l.supplier) ? l.supplier[0] ?? null : l.supplier,
      })));
    }
    setLoading(false);
  }

  function startEdit(lot: Lot) {
    setEditingId(lot.id);
    setFinishedWeight(lot.finished_weight_lb ? String(lot.finished_weight_lb) : '');
    setWasteWeight(lot.waste_weight_lb ? String(lot.waste_weight_lb) : '');
    setOutputGrades(
      lot.output_breakdown
        ? Object.fromEntries(Object.entries(lot.output_breakdown).map(([k, v]) => [k, String(v)]))
        : {}
    );
    setProcNotes(lot.processing_notes || '');
  }

  function cancelEdit() {
    setEditingId(null);
    setFinishedWeight('');
    setWasteWeight('');
    setOutputGrades({});
    setProcNotes('');
  }

  function receivedWeightOf(lot: Lot): number {
    return Number(lot.whole_weight_lb || lot.clean_weight_lb || 0);
  }

  async function save(lot: Lot) {
    const finished = Number(finishedWeight);
    if (!Number.isFinite(finished) || finished <= 0) { alert('Enter the finished saleable weight (lbs)'); return; }
    const received = receivedWeightOf(lot);
    if (received <= 0) { alert('Cannot compute yield - intake has no received weight'); return; }
    if (finished > received) {
      if (!confirm(`Finished weight (${finished}) is GREATER than received (${received}). Are you sure?`)) return;
    }

    setSaving(true);
    const yieldPct = Math.round((finished / received) * 10000) / 100;
    const trueCostPerLb = Number(lot.cost_paid) > 0
      ? Math.round((Number(lot.cost_paid) / finished) * 100) / 100
      : null;

    const cleanedGrades: Record<string, number> = {};
    for (const [k, v] of Object.entries(outputGrades)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) cleanedGrades[k] = n;
    }
    const breakdown = Object.keys(cleanedGrades).length > 0 ? cleanedGrades : null;

    const update: Record<string, unknown> = {
      finished_weight_lb: finished,
      waste_weight_lb: wasteWeight ? Number(wasteWeight) : Math.max(0, received - finished),
      output_breakdown: breakdown,
      yield_pct: yieldPct,
      processed_at: new Date().toISOString(),
      processed_by: me || 'Staff',
      processing_notes: procNotes.trim() || null,
    };
    if (trueCostPerLb !== null) update.true_cost_per_lb = trueCostPerLb;

    const { error: err } = await supabase.from('yield_lots').update(update).eq('id', lot.id);
    setSaving(false);
    if (err) {
      alert(`Save failed: ${plainError(err)}\n\nIf 'column' error, run sql/2026-05-09-yield-measure.sql in Supabase.`);
      return;
    }
    cancelEdit();
    load();
  }

  const stats = useMemo(() => {
    const measured = lots.filter((l) => l.processed_at);
    const pending = lots.filter((l) => !l.processed_at);
    const totalFinished = measured.reduce((s, l) => s + Number(l.finished_weight_lb || 0), 0);
    const totalCost = measured.reduce((s, l) => s + Number(l.cost_paid || 0), 0);
    const avgYield = measured.length
      ? measured.reduce((s, l) => s + Number(l.yield_pct || 0), 0) / measured.length
      : 0;
    const avgCostPerLb = totalFinished > 0 ? totalCost / totalFinished : 0;
    return {
      pending: pending.length,
      measured: measured.length,
      totalFinished: Math.round(totalFinished * 10) / 10,
      avgYield: Math.round(avgYield * 100) / 100,
      avgCostPerLb: Math.round(avgCostPerLb * 100) / 100,
    };
  }, [lots]);

  const pendingLots = lots.filter((l) => !l.processed_at);
  const measuredLots = lots.filter((l) => l.processed_at);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Yield Measurement
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Real measurements only — no assumptions. Updates yield_pct + true_cost_per_lb on each lot from actual finished weight.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Stat label="Pending"     value={stats.pending}                accent="#f5c518" />
        <Stat label="Measured"    value={stats.measured}               accent="#22c55e" />
        <Stat label="Avg yield %" value={`${stats.avgYield.toFixed(1)}%`} accent="#a78bfa" />
        <Stat label="Avg $/lb"    value={`$${stats.avgCostPerLb.toFixed(2)}`} accent="#fb923c" />
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginBottom: 12 }}>
          ⚠️ {error}
          {(error.toLowerCase().includes('relation') || error.toLowerCase().includes('column')) && (
            <div style={{ marginTop: 6 }}>Run sql/2026-05-09-yield-measure.sql (and lobster-intake.sql if not done) in Supabase.</div>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginTop: 6, marginBottom: 6 }}>
        Pending measurement ({pendingLots.length})
      </div>

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && pendingLots.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center', fontSize: 12 }}>
          All intakes have been measured. Add new intakes via /lobster-intake.
        </div>
      )}

      {pendingLots.map((lot) => {
        const received = receivedWeightOf(lot);
        const isEditing = editingId === lot.id;
        const sup = lot.supplier as { name: string } | null;
        return (
          <div key={lot.id} style={{ ...cardStyle, borderLeft: '4px solid #f5c518' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  {lot.product_type} · {received.toFixed(1)} lbs
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Lot <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{lot.lot_number || '—'}</span>
                  {lot.island_source && ` · ${lot.island_source}`}
                  {lot.captain_name && ` · ${lot.captain_name}`}
                  {sup && ` · ${sup.name}`}
                  {lot.received_date && ` · received ${lot.received_date}`}
                </div>
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
                  Cost basis ${Number(lot.cost_paid || 0).toFixed(2)} (${Number(lot.true_cost_per_lb || 0).toFixed(2)}/lb received)
                </div>
              </div>
              {!isEditing && (
                <button onClick={() => startEdit(lot)} style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                  Record yield
                </button>
              )}
            </div>

            {isEditing && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #1e3a5f' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Finished weight (lbs)">
                    <input type="number" step="0.01" min="0" value={finishedWeight} onChange={(e) => setFinishedWeight(e.target.value)} placeholder="actual saleable lbs" style={inputStyle} required />
                  </Field>
                  <Field label="Waste / loss (lbs, optional)">
                    <input type="number" step="0.01" min="0" value={wasteWeight} onChange={(e) => setWasteWeight(e.target.value)} placeholder="auto if blank" style={inputStyle} />
                  </Field>
                </div>

                {finishedWeight && Number(finishedWeight) > 0 && (
                  <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 6, padding: 8, marginBottom: 10, fontSize: 11 }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>
                      Yield: {((Number(finishedWeight) / received) * 100).toFixed(1)}%
                    </div>
                    <div style={{ color: '#fb923c', fontWeight: 700 }}>
                      True cost / lb: ${(Number(lot.cost_paid || 0) / Number(finishedWeight)).toFixed(2)}/lb finished
                    </div>
                  </div>
                )}

                {lot.product_type === 'Lobster Tail' && (
                  <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#f5c518', marginBottom: 6 }}>
                      Output by grade (optional)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                      {TAIL_SIZES.map((sz) => (
                        <div key={sz}>
                          <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>{sz}</div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={outputGrades[sz] || ''}
                            onChange={(e) => setOutputGrades((g) => ({ ...g, [sz]: e.target.value }))}
                            placeholder="0"
                            style={{ ...inputStyle, padding: '6px 8px', fontSize: 12, marginBottom: 0 }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Field label="Processing notes">
                  <input value={procNotes} onChange={(e) => setProcNotes(e.target.value)} placeholder="anything notable about this batch" style={inputStyle} />
                </Field>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => save(lot)}
                    disabled={saving}
                    style={{ flex: 1, background: '#22c55e', color: '#060d1f', border: 'none', borderRadius: 6, padding: '10px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
                  >
                    {saving ? 'Saving…' : 'Save measurement'}
                  </button>
                  <button onClick={cancelEdit} style={{ background: 'transparent', border: '1px solid #94a3b8', color: '#94a3b8', borderRadius: 6, padding: '10px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginTop: 14, marginBottom: 6 }}>
        Measured ({measuredLots.length})
      </div>

      {measuredLots.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center', fontSize: 12 }}>
          No measured lots yet. Process a pending lot to build historical data.
        </div>
      )}

      {measuredLots.map((lot) => {
        const received = receivedWeightOf(lot);
        const finished = Number(lot.finished_weight_lb || 0);
        const sup = lot.supplier as { name: string } | null;
        return (
          <div key={lot.id} style={{ ...cardStyle, borderLeft: '4px solid #22c55e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  {lot.product_type} · {received.toFixed(1)} → {finished.toFixed(1)} lbs
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Lot <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{lot.lot_number || '—'}</span>
                  {sup && ` · ${sup.name}`}
                  {lot.processed_by && ` · processed by ${lot.processed_by}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#a78bfa' }}>{Number(lot.yield_pct || 0).toFixed(1)}%</div>
                <div style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>${Number(lot.true_cost_per_lb || 0).toFixed(2)}/lb</div>
              </div>
            </div>
            {lot.output_breakdown && Object.keys(lot.output_breakdown).length > 0 && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #1e3a5f' }}>
                {Object.entries(lot.output_breakdown).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}: ${Number(v).toFixed(1)}`).join(' · ')}
              </div>
            )}
            {lot.processing_notes && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, fontStyle: 'italic' }}>
                {lot.processing_notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
